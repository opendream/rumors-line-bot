import stringSimilarity from 'string-similarity';
import gql from '../gql';
import {
  createPostbackAction,
  isNonsenseText,
  ellipsis,
  ARTICLE_SOURCES,
} from './utils';
import ga from '../ga';

import i18n from '../i18n';

const SIMILARITY_THRESHOLD = 0.95;

export default async function queryCommand(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  // Track text message type send by user
  const visitor = ga(userId, state, event.input);
  visitor.event({ ec: 'UserInput', ea: 'MessageType', el: 'text' });

  // Store user input into context
  data.searchedText = event.input;

  console.log('SEARCHED TEXT : ' + data.searchedText);

  // Search for articles
  const {
    data: { ListArticles },
  } = await gql`
    query($text: String!) {
      ListArticles(
        filter: { moreLikeThis: { like: $text } }
        orderBy: [{ _score: DESC }]
        first: 4
      ) {
        edges {
          node {
            text
            id
            replyCount
            articleReplies {
              reply {
                id
                text
                type
              }
            }
          }
        }
      }
    }
  `({
    text: event.input,
  });

  console.log('LIST ARTICLES  : ' + ListArticles.edges.length);

  if (ListArticles.edges.length) {
    // Track if find similar Articles in DB.
    visitor.event({ ec: 'UserInput', ea: 'ArticleSearch', el: 'ArticleFound' });

    //TODO:: Filter no reply && flagged

    ListArticles.edges.forEach(edge => {
      console.log(edge.node.replyCount);
      if (edge.node.replyCount <= 0) {
        ListArticles.edges.pop(edge);
        console.log('poppin : ' + edge.node.text);
      }
    });
    console.log('LENGTH AFTER FILTER : ' + ListArticles.edges.length);

    if (ListArticles.edges.length <= 0)
      return { data, state, event, issuedAt, userId, replies, isSkipUser };

    // Track which Article is searched. And set tracking event as non-interactionHit.
    ListArticles.edges.forEach(edge => {
      visitor.event({
        ec: 'Article',
        ea: 'Search',
        el: edge.node.id,
        ni: true,
      });
    });

    const edgesSortedWithSimilarity = ListArticles.edges
      .map(edge => {
        edge.similarity = stringSimilarity.compareTwoStrings(
          // Remove spaces so that we count word's similarities only
          //
          edge.node.text.replace(/\s/g, ''),
          event.input.replace(/\s/g, '')
        );
        return edge;
      })
      .sort((edge1, edge2) => edge2.similarity - edge1.similarity);

    // Store article ids
    data.foundArticleIds = edgesSortedWithSimilarity.map(
      ({ node: { id } }) => id
    );

    // const hasIdenticalDocs =
    //   edgesSortedWithSimilarity[0].similarity >= SIMILARITY_THRESHOLD;
    //
    // if (edgesSortedWithSimilarity.length === 1 && hasIdenticalDocs) {
    //   // choose for user
    //   event.input = 1;
    //
    //   visitor.send();
    //   return {
    //     data,
    //     state: 'CHOOSING_ARTICLE',
    //     event,
    //     issuedAt,
    //     userId,
    //     replies,
    //     isSkipUser: true,
    //   };
    // }

    let articleId = 0;
    edgesSortedWithSimilarity.map(({ node: { id } }) => (articleId = id));
    console.log('ID : ' + articleId);

    replies = [
      //TODO :: Change to prod hostname on deploy
      {
        type: 'text',
        text:
          i18n.__(`cofactFoundThis`) +
          ' http://localhost:3000/article/' +
          articleId,
      },
      // templateMessage,
    ];
  }

  visitor.send();
  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
