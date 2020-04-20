import initState from './handlers/initState';
import choosingArticle from './handlers/choosingArticle';
import choosingReply from './handlers/choosingReply';
import askingReplyFeedback from './handlers/askingReplyFeedback';
import askingArticleSubmissionReason from './handlers/askingArticleSubmissionReason';
import askingReplyRequestReason from './handlers/askingReplyRequestReason';
import askingArticleSource from './handlers/askingArticleSource';
import defaultState from './handlers/defaultState';
import queryCommand from './handlers/queryCommand';
import { REASON_PREFIX, DOWNVOTE_PREFIX } from './handlers/utils';

/**
 * Given input event and context, outputs the new context and the reply to emit.
 * Invokes handlers with regard to the current state.
 *
 * State diagram: http://bit.ly/2hnnXjZ
 *
 * @param {Object<state, data>} context The current context of the bot
 * @param {*} event The input event
 * @param {*} issuedAt When this request is issued. Will be written in postback replies.
 * @param {*} userId LINE user ID that does the input
 */
export default async function handleGroupInput(
  { state = '__INIT__', data = {} },
  event,
  issuedAt,
  userId
) {
  let replies;
  let isSkipUser = false;

  if (event.input === undefined) {
    throw new Error('input undefined');
  }

  if (event.input.length > 6 && event.input.startsWith('/query')) {
    state = 'QUERY_COMMAND';
  } else {
    return;
  }

  let params = {
    data,
    state,
    event,
    issuedAt,
    userId,
    replies,
    isSkipUser,
  };

  // Sets state, data and replies
  //
  do {
    params.isSkipUser = false;
    switch (params.state) {
      case 'CHOOSING_ARTICLE': {
        console.log("CHOOSING_ARTICLE" + params);
        params = await choosingArticle(params);
        break;
      }
      case 'CHOOSING_REPLY': {
        console.log("CHOOSING_Reply" + params);
        params = await choosingReply(params);
        break;
      }
      case 'ASKING_REPLY_FEEDBACK': {

        // console.log("CHOOSING_ARTICLE" + params);
        params = await askingReplyFeedback(params);
        break;
      }
      case 'ASKING_ARTICLE_SUBMISSION_REASON': {
        params = await askingArticleSubmissionReason(params);
        break;
      }
      case 'ASKING_REPLY_REQUEST_REASON': {
        params = await askingReplyRequestReason(params);
        break;
      }
      case 'ASKING_ARTICLE_SOURCE': {
        params = await askingArticleSource(params);
        break;
      }
      case 'QUERY_COMMAND': {
        params = await queryCommand(params);
        break;
      }
      default: {
        params = defaultState(params);
        break;
      }
    }
    ({ isSkipUser } = params);
  } while (isSkipUser);

  ({ state, data, replies } = params);

  return {
    context: { state, data },
    replies,
  };
}
