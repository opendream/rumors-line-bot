import gql from '../gql';
import {
  createPostbackAction,
  createReferenceWords,
  createTypeWords,
  ellipsis,
  getArticleURL,
  getLIFFURL,
  DOWNVOTE_PREFIX,
} from './utils';
import ga from '../ga';
import i18n from '../i18n';

export default async function choosingReply(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  if (!data.foundReplyIds) {
    throw new Error('foundReplyIds not set in data');
  }

  const visitor = ga(userId, state, data.selectedArticleText);

  const selectedReplyId = data.foundReplyIds[event.input - 1];

  if (!selectedReplyId) {
    replies = [
      {
        type: 'text',
        text: `${i18n.__("Please enter 1~")}${data.foundReplyIds.length} ${i18n.__("number to choose to respond.")}`,
      },
    ];

    state = 'CHOOSING_REPLY';
  } else {
    const {
      data: { GetReply },
    } = await gql`
      query($id: String!) {
        GetReply(id: $id) {
          type
          text
          reference
          createdAt
        }
      }
    `({ id: selectedReplyId });

    const articleUrl = getArticleURL(data.selectedArticleId);

    replies = [
      {
        type: 'text',
        text: `💡 ${i18n.__("Someone on the Internet responded to this message like this:")}`,
      },
      {
        type: 'text',
        text: ellipsis(GetReply.text, 2000),
      },
      {
        type: 'text',
        text: ellipsis(createReferenceWords(GetReply), 2000),
      },
      {
        type: 'text',
        text: `⬆️ ${i18n.__("In summary, the respondent believes that it")}${createTypeWords(
          GetReply.type
        )}。\n\n💁 ${i18n.__("The above information is provided by good people. Please consider the source and reason to think about it.")} \n${
          data.foundReplyIds.length > 1
            ? `🗣️ ${"There are many different responses to this message. It is recommended to go to this place once and then judge:"} \n${articleUrl}\n`
            : ''
        }\n⁉️ ${i18n.__("If you have a different opinion on this message, please feel free to write a new response here:")} \n${articleUrl}`,
      },
      {
        type: 'template',
        altText:
          i18n.__(`Is the above response helpful?`) + '\n' + i18n.__(`\"Yes\", please enter \"y\", \"No\", please respond to the phone.`),
        template: {
          type: 'confirm',
          text: i18n.__(`Is the above response helpful?`),
          actions: [
            createPostbackAction(i18n.__(`Yes`), 'y', issuedAt),
            {
              type: 'uri',
              label: i18n.__(`No`),
              uri: getLIFFURL(
                'ASKING_REPLY_FEEDBACK',
                GetReply.text,
                DOWNVOTE_PREFIX,
                issuedAt
              ),
            },
          ],
        },
      },
    ];
    // Track when user select a reply.
    visitor.event({ ec: 'Reply', ea: 'Selected', el: selectedReplyId });
    // Track which reply type reply to user.
    visitor.event({ ec: 'Reply', ea: 'Type', el: GetReply.type, ni: true });

    data.selectedReplyId = selectedReplyId;
    state = 'ASKING_REPLY_FEEDBACK';
  }

  visitor.send();
  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
