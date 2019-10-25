import gql from '../gql';
import ga from '../ga';
import {
  getArticleURL,
  createTypeWords,
  ellipsis,
  DOWNVOTE_PREFIX,
} from './utils';
import i18n from '../i18n';

export default async function askingReplyFeedback(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  if (!data.selectedReplyId) {
    throw new Error('selectedReply not set in data');
  }

  const visitor = ga(userId, state, data.selectedArticleText);

  // Track when user give feedback.
  visitor.event({
    ec: 'UserInput',
    ea: 'Feedback-Vote',
    el: `${data.selectedArticleId}/${data.selectedReplyId}`,
  });

  if (event.input === 'y') {
    const {
      data: {
        action: { feedbackCount },
      },
    } = await gql`
      mutation($vote: FeedbackVote!, $articleId: String!, $replyId: String!) {
        action: CreateOrUpdateArticleReplyFeedback(
          vote: $vote
          articleId: $articleId
          replyId: $replyId
        ) {
          feedbackCount
        }
      }
    `(
      {
        articleId: data.selectedArticleId,
        replyId: data.selectedReplyId,
        vote: 'UPVOTE',
      },
      { userId }
    );
    const {
      data: { GetReply },
    } = await gql`
      query($replyId: String!) {
        GetReply(id: $replyId) {
          type
          text
          reference
        }
      }
    `({
      replyId: data.selectedReplyId,
    });

    const articleUrl = getArticleURL(data.selectedArticleId);
    let sharedText = `${i18n.__("Someone on the internet said")}「${ellipsis(
      data.selectedArticleText,
      8
    )}」 ${createTypeWords(
      GetReply.type
    )}${i18n.__("Oh!")} \n\n${i18n.__("Please go to %s to see the responses, reasons, and related sources of the folks!", articleUrl)}`;

    replies = [
      {
        type: 'text',
        text:
          feedbackCount > 1
            ? `${i18n.__("Thank you for your feedback with other %s people.", feedbackCount - 1)}`
            : i18n.__(`Thank you for your feedback, you are the first to comment on this response :)`),
      },
      {
        type: 'template',
        altText: `📲 ${i18n.__("Don't forget to pass the above response back to your chat room and show it to others!")}\n💁 ${i18n.__("If you think you can respond better, welcome to %s to submit a new response!", articleUrl)}`,
        template: {
          type: 'confirm',
          text: `📲 ${i18n.__("Don't forget to pass the above response back to your chat room and show it to others!")}\n💁 ${i18n.__("If you think you can respond better, please feel free to submit a new response!")}`,
          actions: [
            {
              type: 'uri',
              label: i18n.__(`Share with friends`),
              uri: `line://msg/text/?${encodeURI(sharedText)}`,
            },
            {
              type: 'uri',
              label: i18n.__(`Submit a new response`),
              uri: getArticleURL(data.selectedArticleId),
            },
          ],
        },
      },
    ];

    visitor.send();
    state = '__INIT__';
  } else if (event.input.startsWith(DOWNVOTE_PREFIX)) {
    const comment = event.input.slice(DOWNVOTE_PREFIX.length);
    const {
      data: {
        action: { feedbackCount },
      },
    } = await gql`
      mutation(
        $comment: String!
        $vote: FeedbackVote!
        $articleId: String!
        $replyId: String!
      ) {
        action: CreateOrUpdateArticleReplyFeedback(
          comment: $comment
          articleId: $articleId
          replyId: $replyId
          vote: $vote
        ) {
          feedbackCount
        }
      }
    `(
      {
        articleId: data.selectedArticleId,
        replyId: data.selectedReplyId,
        comment,
        vote: 'DOWNVOTE',
      },
      { userId }
    );

    replies = [
      {
        type: 'text',
        text:
          feedbackCount > 1
            ? `${i18n.__("Thank you for your feedback with other %s people.", feedbackCount - 1)}`
            : i18n.__(`Thank you for your feedback, you are the first to comment on this response :)`),
      },
      {
        type: 'text',
        text: `💁 ${i18n.__("If you think you can respond better, welcome to %s to submit a new response!", getArticleURL(
          data.selectedArticleId
        ) )}` ,
      },
    ];

    visitor.send();
    state = '__INIT__';
  } else {
    replies = [
      {
        type: 'text',
        text:
          i18n.__(`Please click "Yes" or "No" above to express your opinion on the response, or change the other information to me.`),
      },
    ];

    // Don't do visitor.send() nor change state here because user did not respond yet
  }

  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
