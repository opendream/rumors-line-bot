import {
  REASON_PREFIX,
  getLIFFURL,
  createAskArticleSubmissionReply,
  ellipsis,
} from './utils';
import ga from '../ga';
import i18n from '../i18n';

export default async function askingArticleSource(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  const source = data.articleSources[event.input - 1];
  if (!source) {
    replies = [
      {
        type: 'text',
        text: `${i18n.__("Please enter 1~")}${data.articleSources.length} ${i18n.__("number, choose the source of the message.")}`,
      },
    ];
    state = 'ASKING_ARTICLE_SOURCE';
    return { data, state, event, issuedAt, userId, replies, isSkipUser };
  }

  const visitor = ga(userId, state, data.selectedArticleText);
  // Track the source of the new message.
  visitor.event({ ec: 'Article', ea: 'ProvidingSource', el: source });
  if (source === i18n.__(`Input by yourself`)) {
    replies = [
      {
        type: 'template',
        altText:
          i18n.__(`Ok, I suggest you pass the message to Sure and Share. Both are very professional rumors and you have a 💁 someone to answer your questions!`),
        template: {
          type: 'confirm',
          text:
            i18n.__(`Ok, I suggest you pass the message to Sure and Share. Both are very professional rumors and you have a 💁 someone to answer your questions!`),
          actions: [
            {
              type: 'uri',
              label: i18n.__(`SureAndShare`),
              uri: `line://ti/p/geq7886n`,
            },
            {
              type: 'uri',
              label: i18n.__(`Rum toast`),
              uri: `line://ti/p/1q14ZZ8yjb`,
            },
          ],
        },
      },
    ];

    state = '__INIT__';
  } else if (
    data.foundArticleIds &&
    data.foundArticleIds.length > 0 &&
    data.selectedArticleId
  ) {
    // articles that are already reported
    const altText =
      i18n.__(`[Talk to the editor about your doubts]`) + ' \n' +
      i18n.__(`Ok, thank you. If you think this is a rumor, please point out that you have doubts and persuade the editor that this is a message that should be blamed.`) + ' \n' +
      '\n' +
      i18n.__(`Please click on the \"⌨️\" button in the lower left corner to send us the reason why \"what you think is a rumor\" to help the editors to clarify your doubts;`) + '\n' +
      i18n.__(`If you want to skip, please enter \"n\".`);

    replies = [
      {
        type: 'flex',
        altText,
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: i18n.__(`Tell your doubts with the editor`),
                weight: 'bold',
                color: '#009900',
                size: 'sm',
              },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
              {
                type: 'text',
                text:
                  i18n.__(`Ok, thank you. If you want to be ignorant, you can follow this one, please click \"I want to know\" to tell everyone your thoughts.`),
                wrap: true,
              },
            ],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                style: 'primary',
                action: {
                  type: 'uri',
                  label: '🙋 '+ i18n.__(`I want to know`),
                  uri: getLIFFURL(
                    'ASKING_REPLY_REQUEST_REASON',
                    data.searchedText,
                    REASON_PREFIX,
                    issuedAt
                  ),
                },
              },
            ],
          },
        },
      },
    ];

    state = 'ASKING_REPLY_REQUEST_REASON';
  } else {
    // brand new articles
    replies = [
      {
        type: 'text',
        text: i18n.__(`Ok, thank you.`),
      },
    ].concat(
      createAskArticleSubmissionReply(
        'ASKING_ARTICLE_SUBMISSION_REASON',
        ellipsis(data.searchedText, 12),
        REASON_PREFIX,
        issuedAt
      )
    );
    state = 'ASKING_ARTICLE_SUBMISSION_REASON';
  }
  visitor.send();
  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
