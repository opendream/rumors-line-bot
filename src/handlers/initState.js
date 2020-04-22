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

export default async function initState(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  // Track text message type send by user
  const visitor = ga(userId, state, event.input);
  visitor.event({ ec: 'UserInput', ea: 'MessageType', el: 'text' });

  // Store user input into context
  data.searchedText = event.input;

  // Search for articles
  const {
    data: { ListArticles },
  } = await gql`
    query($text: String!) {
      ListArticles(
        filter: { moreLikeThis: { like: $text, minimumShouldMatch: "0" } }
        orderBy: [{ _score: DESC }]
        first: 4
      ) {
        edges {
          node {
            title
            text
            id
          }
        }
      }
    }
  `({
    text: event.input,
  });

  const articleSummary = ellipsis(event.input, 12);

  if (ListArticles.edges.length) {
    // Track if find similar Articles in DB.
    visitor.event({ ec: 'UserInput', ea: 'ArticleSearch', el: 'ArticleFound' });

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

    const hasIdenticalDocs =
      edgesSortedWithSimilarity[0].similarity >= SIMILARITY_THRESHOLD;

    if (edgesSortedWithSimilarity.length === 1 && hasIdenticalDocs) {
      // choose for user
      event.input = 1;

      visitor.send();
      return {
        data,
        state: 'CHOOSING_ARTICLE',
        event,
        issuedAt,
        userId,
        replies,
        isSkipUser: true,
      };
    }

    const templateMessage = {
      type: 'template',
      altText: edgesSortedWithSimilarity
        .map(
          ({ node: { text } }, idx) =>
            i18n.__(`Please choose to play %s> %s`, idx + 1, ellipsis(text, 20, ''))

        )
        .concat(hasIdenticalDocs ? [] : [i18n.__("pleaseCall", 0)])
        .join('\n\n'),
      template: {
        type: 'carousel',
        columns: ListArticles.edges
          .map(({ node: { title, text }, similarity }, idx) => ({
            // text: `[${i18n.__("similarity")}:${(similarity * 100).toFixed(2) + '%'}] \n ${ellipsis(text, 80, '')}`,
            text: `${ellipsis(title || text, 110, '...')}`,
            actions: [createPostbackAction(i18n.__("chooseThis"), idx + 1, issuedAt)],
          }))
          .concat(
            hasIdenticalDocs
              ? []
              : [
                  {
                    text: i18n.__('No one here is a message from me.'),
                    actions: [createPostbackAction(i18n.__("select"), 0, issuedAt)],
                  },
                ]
          ),
      },
    };

    replies = [
      {
        type: 'text',
        text: i18n.__(`queryResponses`, articleSummary),
      },
      {
        type: 'text',
        text: i18n.__("messageYouJustSent"),
        delay: 3,
      },
      templateMessage,
    ];
    state = 'CHOOSING_ARTICLE';
  } else {
    if (isNonsenseText(event.input)) {
      // Track if find similar Articles in DB.
      visitor.event({
        ec: 'UserInput',
        ea: 'ArticleSearch',
        el: 'NonsenseText',
      });

      replies = [
        {
          type: 'text',
          text:
            i18n.__("informTooSmall") + '\n' +
            i18n.__("referManual") + 'http://bit.ly/cofacts-line-users',
        },
      ];
      state = '__INIT__';
    } else {
      // Track if find similar Articles in DB.
      visitor.event({
        ec: 'UserInput',
        ea: 'ArticleSearch',
        el: 'ArticleNotFound',
      });

      data.articleSources = ARTICLE_SOURCES;
      const altText =
        i18n.__(`cantFindOut`, articleSummary) + '\n' +
        '\n' +
        i18n.__(`whereSeeMessage`) + '\n' +
        '\n' +
        data.articleSources
          .map((option, index) => `${option} > ${i18n.__("pleasePass")} ${index + 1}\n`)
          .join('') +
        '\n' +
        i18n.__(`pleasePressButton`);

      replies = [
        {
          type: 'text',
          text: `${i18n.__('Can not find %s message', articleSummary)}`
        },
        // {
        //   type: 'text',
        //   text: `${i18n.__('Advise you to send this message to There is a professional media team ready to help you check the truth.')}`,
        //   delay: 3
        // },
        {
          type: 'template',
          altText,
          template: {
            type: 'buttons',
            text: `${i18n.__('Where did you see this message from?')}`,
            actions: data.articleSources.map((option, index) =>
              createPostbackAction(option, index + 1, issuedAt)
            ),
          },
          delay: 3
        },
      ];
      state = 'ASKING_ARTICLE_SOURCE';
    }
  }
  visitor.send();
  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
