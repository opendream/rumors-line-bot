import gql from '../gql';
import ga from '../ga';
import { h64 } from 'xxhashjs';

import i18n from '../i18n';

const xxhash64 = h64();
export function getArticleId(text) {
  return xxhash64
    .update(text)
    .digest()
    .toString(36);
}

export default async function queryCommand(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  // Track text message type send by user
  const visitor = ga(userId, state, event.input);
  visitor.event({ ec: 'UserInput', ea: 'MessageType', el: 'text' });

  // Store user input into context
  data.searchedText = event.input;

  let inputArticleId = getArticleId(event.input);

  // Search for articles
  const {
    data: { GetArticle },
  } = await gql`
    query($text: String!) {
      GetArticle(id: $text) {
        id
        text
        replyCount
        articleReplies {
          reply {
            id
            type
          }
        }
      }
    }
  `({
    text: inputArticleId,
  });

  if (GetArticle.replyCount > 0) {
    for (let i = 0; i < GetArticle.articleReplies.length; i++) {
      if (
        GetArticle.articleReplies[i].reply.type === 'NOT_ARTICLE' ||
        GetArticle.articleReplies[i].reply.type === 'OPINIONATED'
      )
        return { data, state, event, issuedAt, userId, replies, isSkipUser };
    }

    replies = [
      //TODO :: Change to prod hostname on deploy
      {
        type: 'text',
        text:
          i18n.__(`cofactFoundThis`) +
          'http://localhost:3000/article/' +
          inputArticleId,
      },
      // templateMessage,
    ];

    visitor.send();
    return { data, state, event, issuedAt, userId, replies, isSkipUser };
  }
}
