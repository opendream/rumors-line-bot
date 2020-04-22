import gql from '../gql';
import {
  createPostbackAction,
  createFeedbackWords,
  createTypeWords,
  isNonsenseText,
  getArticleURL,
  ellipsis,
  ARTICLE_SOURCES,
} from './utils';
import ga from '../ga';
import i18n from '../i18n';

/**
 * 第2句 (template message)：按照時間排序「不在查證範圍」之外的回應，每則回應第一行是
 * 「✅ 含有真實訊息」或「❌ 含有不實訊息」之類的 (含 emoticon)，然後是回應文字。如果
 * 還有空間，才放「不在查證範圍」的回應。最後一句的最後一格顯示「看其他回應」，連到網站。
 */
function reorderArticleReplies(articleReplies) {
  const verifiedReplies = [];
  const replies = [];
  const notArticleReplies = [];

  for (let articleReply of articleReplies) {
    if (articleReply.user && articleReply.user.belongTo) {
      verifiedReplies.push(articleReply)
    } else {
      if (articleReply.reply.type !== 'NOT_ARTICLE') {
        replies.push(articleReply);
      } else {
        notArticleReplies.push(articleReply);
      }
    }
  }
  return verifiedReplies.concat(replies.concat(notArticleReplies));
}

// https://developers.line.me/en/docs/messaging-api/reference/#template-messages
function createAltText(articleReplies) {
  const eachLimit = 400 / articleReplies.slice(0, 10).length - 5;
  let alt = articleReplies
    .slice(0, 10)
    .map(({ reply, positiveFeedbackCount, negativeFeedbackCount }, idx) => {
      const prefix = `${i18n.__("Read please pass")} ${idx + 1}> ${createTypeWords(
        reply.type
      )}\n${createFeedbackWords(positiveFeedbackCount, negativeFeedbackCount)}`;
      const content = ellipsis(reply.text, eachLimit - prefix.length, '');
      return `${prefix}\n${content}`;
    })
    .join('\n\n');

  return ellipsis(alt, 1000);
}

export default async function choosingArticle(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  if (!data.foundArticleIds) {
    throw new Error('foundArticleIds not set in data');
  }

  data.selectedArticleId = data.foundArticleIds[event.input - 1];
  const { selectedArticleId } = data;
  const doesNotContainMyArticle = +event.input === 0;

  if (doesNotContainMyArticle && isNonsenseText(data.searchedText)) {
    replies = [
      {
        type: 'text',
        text:
          i18n.__(`The amount of information you just sent was too small, and the editor could not verify it.`) + ' \n' +
          + i18n.__(`Please refer to the 📖 manual for the scope of verification.`) + ' http://bit.ly/cofacts-line-users',
      },
    ];
    state = '__INIT__';
  } else if (doesNotContainMyArticle) {
    data.articleSources = ARTICLE_SOURCES;
    const altText =
      i18n.__(`Where did you see this message from?`) + ' \n' +
      '\n' +
      data.articleSources
        .map((option, index) => `${option} > ${i18n.__(`Please pass`)} ${index + 1}\n`)
        .join('') +
      '\n' +
      i18n.__(`pleasePressButton`);

    replies = [
      {
        type: 'text',
        text: i18n.__(`Ah, it seems that your message has not been included in our database.`) 
      },
      {
        type: 'template',
        altText,
        template: {
          type: 'buttons',
          text:
            i18n.__(`whereSeeMessage`),
          actions: data.articleSources.map((option, index) =>
            createPostbackAction(option, index + 1, issuedAt)
          ),
        },
      },
    ];

    state = 'ASKING_ARTICLE_SOURCE';
  } else if (!selectedArticleId) {
    replies = [
      {
        type: 'text',
        text: `${i18n.__("Please enter 1~")}${data.foundArticleIds.length} ${i18n.__("number, to choose the message.")}`,
      },
    ];

    state = 'CHOOSING_ARTICLE';
  } else {
    const {
      data: { GetArticle },
    } = await gql`
      query($id: String!) {
        GetArticle(id: $id) {
          text
          replyCount
          articleReplies(status: NORMAL) {
            user {
              id
              belongTo
            }
            reply {
              id
              type
              text
            }
            positiveFeedbackCount
            negativeFeedbackCount
          }
        }
      }
    `({
      id: selectedArticleId,
    });

    data.selectedArticleText = GetArticle.text;

    const visitor = ga(userId, state, data.selectedArticleText);

    // Track which Article is selected by user.
    visitor.event({
      ec: 'Article',
      ea: 'Selected',
      el: selectedArticleId,
    });

    const count = {};

    GetArticle.articleReplies.forEach(ar => {
      // Track which Reply is searched. And set tracking event as non-interactionHit.
      visitor.event({ ec: 'Reply', ea: 'Search', el: ar.reply.id, ni: true });

      const type = ar.reply.type;
      if (!count[type]) {
        count[type] = 1;
      } else {
        count[type]++;
      }
    });

    const articleReplies = reorderArticleReplies(GetArticle.articleReplies);
    const summary =
      i18n.__(`This message has %s comments:`, GetArticle.articleReplies.length) + ' \n' +
      `${count.NOT_RUMOR || 0} ${i18n.__("Then the response is marked")} ${i18n.__("almost real information")} ✅\n` +
      `${count.RUMOR_NOT_RUMOR || 0} ${i18n.__("Then the response is marked")} ${i18n.__("contains real information")} ◑\n` +
      `${count.RUMOR || 0} ${i18n.__("Then the response is marked")} ${i18n.__("contains false information")} ❌\n` +
      `${count.OPINIONATED || 0} ${i18n.__("Then the response is marked")} ${i18n.__("contains personal opinions")} 💬\n` +
      `${count.NOT_ARTICLE || 0} ${i18n.__("Then the response is marked")} ${i18n.__(`Not in the scope of verification`)} ⚠️️\n`;

    replies = [
      {
        type: 'text',
        text: summary,
      },
    ];

    if (articleReplies.length !== 0) {
      data.foundReplyIds = articleReplies.map(({ reply, user }) => ({id: reply.id, belongTo: user && user.belongTo}));

      state = 'CHOOSING_REPLY';

      if (articleReplies.length === 1) {
        // choose for user
        event.input = 1;

        visitor.send();
        return {
          data,
          state: 'CHOOSING_REPLY',
          event,
          issuedAt,
          userId,
          replies,
          isSkipUser: true,
        };
      }

      replies.push({
        type: 'template',
        altText: createAltText(articleReplies),
        template: {
          type: 'carousel',
          columns: articleReplies
            .slice(0, 10)
            .map(
              (
                { reply, positiveFeedbackCount, negativeFeedbackCount, user },
                idx
              ) => {
                let limitWords = 110;

                let verifiedBy = ''
                if (user && user.belongTo) {
                  verifiedBy = ' ' + i18n.__('verified by %s 🌟:', user.belongTo);
                }

                let prefix = 
                i18n.__('Comment no.%s', idx + 1) + verifiedBy +
                '\n' +
                createTypeWords(reply.type) +
                '\n' +
                createFeedbackWords(
                  positiveFeedbackCount,
                  negativeFeedbackCount
                ) +
                '\n';

                return {
                  text: ellipsis(prefix + reply.text, limitWords, '...'),
                  actions: [
                    createPostbackAction(i18n.__(`Read this response`), idx + 1, issuedAt),
                  ],
                }
              }
            ),
        },
      });

      if (articleReplies.length > 10) {
        replies.push({
          type: 'text',
          text: `${i18n.__(`For more responses please go to:`)} ${getArticleURL(selectedArticleId)}`,
        });
      }
    } else {
      // No one has replied to this yet.

      // Track not yet reply Articles.
      visitor.event({
        ec: 'Article',
        ea: 'NoReply',
        el: selectedArticleId,
      });

      data.articleSources = ARTICLE_SOURCES;
      const altText =
        i18n.__(`Sorry, no one has responded to this message yet!`) + ' \n' +
        '\n' +
        i18n.__(`Where did you see this message from?`) + ' \n' +
        '\n' +
        data.articleSources
          .map((option, index) => `${option} > พิมพ์ ${index + 1}\n`)
          .join('') +
        '\n' +
        i18n.__(`pleasePressButton`);

      replies = [
        {
          type: 'template',
          altText,
          template: {
            type: 'buttons',
            text:
              i18n.__(`Sorry, no one has responded to this message yet!`) + '\n\n' + i18n.__(`whereSeeMessage`),
            actions: data.articleSources.map((option, index) =>
              createPostbackAction(option, index + 1, issuedAt)
            ),
          },
        },
      ];

      state = 'ASKING_ARTICLE_SOURCE';
    }
    visitor.send();
  }

  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
