import Koa from 'koa';
import Router from 'koa-router';
import cors from '@koa/cors';


import rollbar from './rollbar';
import { version } from '../package.json';

import redis from './redisClient';
import checkSignatureAndParse from './checkSignatureAndParse';
import lineClient from './lineClient';
import handleInput from './handleInput';
import { uploadImageFile, uploadVideoFile } from './fileUpload';
import ga from './ga';
import i18n from './i18n';
import handleGroupInput from './handleGroupInput';

const app = new Koa();
const router = Router();
const userIdBlacklist = (process.env.USERID_BLACKLIST || '').split(',');

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    rollbar.error(err, ctx.request);
    throw err;
  }
});

router.get('/', ctx => {
  ctx.body = JSON.stringify({ version });
});

router.get(
  '/context/:userId',
  cors({
    origin: process.env.LIFF_CORS_ORIGIN,
  }),
  async ctx => {
    const { state, issuedAt } = (await redis.get(ctx.params.userId)) || {};

    ctx.body = {
      state,
      issuedAt,
    };
  }
);

const singleUserHandler = async (
  req,
  type,
  replyToken,
  userId,
  otherFields
) => {
  if (userIdBlacklist.indexOf(userId) !== -1) {
    // User blacklist
    console.log(
      `[LOG] Blocked user INPUT =\n${JSON.stringify({
        type,
        userId,
        ...otherFields,
      })}\n`
    );
    return;
  }

  // Handle follow/unfollow event
  if (type === 'unfollow' || type === 'follow') {
    return;
  }

  // Set default result
  //
  let result = {
    context: '__INIT__',
    replies: [
      {
        type: 'text',
        text: i18n.__(`UnsupportedMessageTypeWarning`),
      },
    ],
  };

  // React to certain type of events
  //
  if (
    (type === 'message' && otherFields.message.type === 'text') ||
    (type === 'message' && otherFields.message.type === 'image') ||
    (type === 'message' && otherFields.message.type === 'video') ||
    type === 'postback'
  ) {
    const context = (await redis.get(userId)) || {};

    // normalized "input"
    let input;
    if (type === 'postback') {
      const data = JSON.parse(otherFields.postback.data);

      // When if the postback is expired,
      // i.e. If other new messages have been sent before pressing buttons,
      // Don't do anything, just ignore silently.
      //
      if (data.issuedAt !== context.issuedAt) {
        console.log('Previous button pressed.');
        lineClient('/message/reply', {
          replyToken,
          messages: [
            {
              type: 'text',
              text: i18n.__(`Sorry, can't go back to that step.`),
            },
          ],
        });
        return;
      }

      input = data.input;
    } else if (type === 'message') {

      if (otherFields.message.type === 'text') {
        input = otherFields.message.text;
      } else if (otherFields.message.type === 'image') {

        const { hash, fileData } = await uploadImageFile(otherFields.message.id)
        console.log('uploadImageFile', hash, fileData)

        input = `\$image__${hash}__${fileData.id}`
      } else if (otherFields.message.type === 'video') {

        const { hash, fileData } = await uploadVideoFile(otherFields.message.id)

        input = `\$video__${hash}__${fileData.id}`
      }
    }

    // Debugging: type 'RESET' to reset user's context and start all over.
    //
    if (input === 'RESET') {
      redis.del(userId);
      return;
    }

    try {
      // When this message is received.
      //
      const issuedAt = Date.now();
      result = await handleInput(
        context,
        { type, input, ...otherFields },
        issuedAt,
        userId
      );

      if (!result.replies) {
        throw new Error(
          'Returned replies is empty, please check processMessages() implementation.'
        );
      }

      // Renew "issuedAt" of the resulting context.
      result.context.issuedAt = issuedAt;
    } catch (e) {
      console.error(e);
      rollbar.error(e, req);

      result = {
        context: { state: '__INIT__', data: {} },
        replies: [
          {
            type: 'text',
            text: i18n.__(`BotIsOutOfOrder`),
          },
        ],
      };
    }

    // LOGGING:
    // 60 chars per line, each prepended with [[LOG]]
    //
    console.log('\n||LOG||<----------');
    JSON.stringify({
      CONTEXT: context,
      INPUT: { type, userId, ...otherFields },
      OUTPUT: result,
    })
      .split(/(.{60})/)
      .forEach(line => {
        if (line) {
          // Leading \n makes sure ||LOG|| is in the first line
          console.log(`\n||LOG||${line}`);
        }
      });
    console.log('\n||LOG||---------->');
  } else if (type === 'message' && otherFields.message.type === 'image') {
    // Track image message type send by user
    ga(userId)
      .event({
        ec: 'UserInput',
        ea: 'MessageType',
        el: otherFields.message.type,
      })
      .send();

    // console.log('otherFields', otherFields)

    uploadImageFile(otherFields.message.id);
  } else if (type === 'message' && otherFields.message.type === 'video') {
    // Track video message type send by user
    ga(userId)
      .event({
        ec: 'UserInput',
        ea: 'MessageType',
        el: otherFields.message.type,
      })
      .send();

    //uploadVideoFile(otherFields.message.id);
  } else if (type === 'message') {
    // Track other message type send by user
    ga(userId)
      .event({
        ec: 'UserInput',
        ea: 'MessageType',
        el: otherFields.message.type,
      })
      .send();
  }

  const ENABLE_DELAY = false;
  if (!ENABLE_DELAY) {
    lineClient('/message/reply', {
      replyToken,
      messages: result.replies,
    });
  } else {
    // Delay reply preparing

    let groupReplies = [];
    let currentRepiles = { replies: [] };

    result.replies.forEach(reply => {
      if (reply.delay) {
        if (currentRepiles.replies.length > 0) {
          groupReplies.push(currentRepiles);
        }
        currentRepiles = { delay: reply.delay, replies: [reply] };
        delete reply.delay;
        // groupReplies.push(currentRepiles);
      } else {
        currentRepiles.replies.push(reply);
      }
    });
    if (currentRepiles.replies.length > 0) {
      groupReplies.push(currentRepiles);
    }

    // Send replies. Does not need to wait for lineClient's callbacks.
    // lineClient's callback does error handling by itself.
    //

    for (let i in groupReplies) {
      const groupResult = groupReplies[i];

      if (groupResult.delay) {
        await new Promise(r => setTimeout(r, groupResult.delay * 1000));
      }

      if (!groupResult.delay && i == 0) {
        lineClient('/message/reply', {
          replyToken,
          messages: groupResult.replies,
        });
      } else {
        lineClient('/message/push', {
          to: userId,
          messages: groupResult.replies,
        });
      }
    }
  }

  // Set context
  //
  await redis.set(userId, result.context);
};

// eslint-disable-next-line
const groupHandler = async (req, type, replyToken, userId, otherFields) => {
  // Handle follow/unfollow event
  if (type === 'unfollow' || type === 'follow') {
    return;
  }

  // Set default result
  //
  let result = {
    context: '__INIT__',
    replies: [
      {
        type: 'text',
        text: i18n.__(`UnsupportedMessageTypeWarning`),
      },
    ],
  };

  // React to certain type of events
  //
  if (
    (type === 'message' && otherFields.message.type === 'text') ||
    type === 'postback'
  ) {
    const context = (await redis.get(userId)) || {};

    // normalized "input"
    let input;
    if (type === 'postback') {
      const data = JSON.parse(otherFields.postback.data);


      console.log("data : "+data.issuedAt + " : context : "+context.issuedAt);

      // When if the postback is expired,
      // i.e. If other new messages have been sent before pressing buttons,
      // Don't do anything, just ignore silently.
      //
      // if (data.issuedAt !== context.issuedAt) {
      //   console.log('Previous button pressed.');
      //   lineClient('/message/reply', {
      //     replyToken,
      //     messages: [
      //       {
      //         type: 'text',
      //         text: i18n.__(`Sorry, can't go back to that step.`),
      //       },
      //     ],
      //   });
      //   return;
      // }

      input = data.input;
    } else if (type === 'message') {
      input = otherFields.message.text;
    }

    // Debugging: type 'RESET' to reset user's context and start all over.
    //
    if (input === 'RESET') {
      redis.del(userId);
      return;
    }

    try {
      // When this message is received.
      //
      const issuedAt = Date.now();
      result = await handleGroupInput(
        context,
        { type, input, ...otherFields },
        issuedAt,
        userId
      );
      // console.log ("RESULTT :  :+ " +result.context + " : " +result.replies);

      //
      // console.log ("REPLIESE  ::  "+result.replies);
      //
      // if (!result.replies) {
      //   throw new Error(
      //     'Returned replies is empty, please check processMessages() implementation.'
      //   );
      // }

      // Renew "issuedAt" of the resulting context.
      result.context.issuedAt = issuedAt;
    } catch (e) {
      console.error(e);
      rollbar.error(e, req);


    }

    // LOGGING:
    // 60 chars per line, each prepended with [[LOG]]
    //
    console.log('\n||LOG||<----------');
    JSON.stringify({
      CONTEXT: context,
      INPUT: { type, userId, ...otherFields },
      OUTPUT: result,
    })
      .split(/(.{60})/)
      .forEach(line => {
        if (line) {
          // Leading \n makes sure ||LOG|| is in the first line
          console.log(`\n||LOG||${line}`);
        }
      });
    console.log('\n||LOG||---------->');
  } else if (type === 'message' && otherFields.message.type === 'image') {
    // Track image message type send by user
    ga(userId)
      .event({
        ec: 'UserInput',
        ea: 'MessageType',
        el: otherFields.message.type,
      })
      .send();

    uploadImageFile(otherFields.message.id);
  } else if (type === 'message' && otherFields.message.type === 'video') {
    // Track video message type send by user
    ga(userId)
      .event({
        ec: 'UserInput',
        ea: 'MessageType',
        el: otherFields.message.type,
      })
      .send();

    //uploadVideoFile(otherFields.message.id);
  } else if (type === 'message') {
    // Track other message type send by user
    ga(userId)
      .event({
        ec: 'UserInput',
        ea: 'MessageType',
        el: otherFields.message.type,
      })
      .send();
  }

  const ENABLE_DELAY = false;
  if (!ENABLE_DELAY) {
    lineClient('/message/reply', {
      replyToken,
      messages: result.replies,
    });
  }
};

// Routes that is after protection of checkSignature
//
router.use('/callback', checkSignatureAndParse);
router.post('/callback', ctx => {
  // Allow free-form request handling.
  // Don't wait for anything before returning 200.

  ctx.request.body.events.forEach(
    async ({ type, replyToken, source, ...otherFields }) => {
      let { userId } = source;
      if (source.type === 'user') {
        singleUserHandler(ctx.request, type, replyToken, userId, otherFields);
      } else if (source.type === 'group') {
        groupHandler(ctx.request, type, replyToken, userId, otherFields);
      }
    }
  );
  ctx.status = 200;
});

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(process.env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log('Listening port', process.env.PORT);
});
