import ga from '../ga';
import gql from '../gql';
import { REASON_PREFIX, getArticleURL, createArticleShareReply } from './utils';
import i18n from '../i18n';

export default async function askingArticleSubmission(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  const visitor = ga(userId, state, data.searchedText);

  if (!event.input.startsWith(REASON_PREFIX)) {
    replies = [
      {
        type: 'text',
        text:
          i18n.__(`Please click on the \"Send button\" above to send the current message to the database or transfer other messages.`),
      },
    ];
  } else {
    visitor.event({ ec: 'Article', ea: 'Create', el: 'Yes' });

    const reason = event.input.slice(REASON_PREFIX.length);
    const {
      data: { CreateArticle },
    } = await gql`
      mutation($text: String!, $reason: String!) {
        CreateArticle(text: $text, reason: $reason, reference: { type: LINE }) {
          id
        }
      }
    `({ text: data.searchedText, reason }, { userId });

    const articleUrl = getArticleURL(CreateArticle.id);

    replies = [
      {
        type: 'text',
        text: `${i18n.__("The message you have returned has been included:")}${articleUrl}`,
      },
      createArticleShareReply(articleUrl, reason),
    ];
    state = '__INIT__';
  }

  visitor.send();
  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
