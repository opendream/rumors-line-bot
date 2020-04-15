import GraphemeSplitter from 'grapheme-splitter';
import i18n from '../i18n';

const splitter = new GraphemeSplitter();

export function createPostbackAction(label, input, issuedAt) {
  return {
    type: 'postback',
    label,
    data: JSON.stringify({
      input,
      issuedAt,
    }),
  };
}

/**
 * @param {number} positive - Count of positive feedbacks
 * @param {number} negative - Count of negative feedbacks
 * @return {string} Description of feedback counts
 */
export function createFeedbackWords(positive, negative) {
  if (positive + negative === 0) return i18n.__(`[No one has yet commented on this response]`);

  let result = '';
  if (positive && negative) {
    result = i18n.__(`There are (%s:%s) people think this response is (helpful:didn't help)`, positive, negative) + '\n';
  } else if (positive) {
    result = i18n.__(`There are %s people think this response is helpful`, positive) + '\n';
  } else if (negative) {
    result = i18n.__(`There are %s people think this response didn't help`, negative) + '\n';
  }
  return `[${result.trim()}]`;
}

/**
 * @param {string} text - The text to show in flex message, text type
 * @return {string} The truncated text
 */
export function createFlexMessageText(text = '') {
  // Actually the upper limit is 2000, but 100 should be enough
  // because we only show the first line
  return ellipsis(text, 100, '');
}

export function createTypeWords(type) {
  switch (type) {
    case 'RUMOR':
      return i18n.__(`Contains false information`) + ' ❌';
    case 'RUMOR_NOT_RUMOR':
      return i18n.__(`Almost real information`) + ' ◑';
    case 'NOT_RUMOR':
      return i18n.__(`Contains real information`) + ' ✅';
    case 'OPINIONATED':
      return i18n.__(`Contains personal opinions`) + ' 💬';
    case 'NOT_ARTICLE':
      return i18n.__(`Not in the scope of verification`) + ' ⚠️️';
  }
  return i18n.__(`The status of the response is undefined!`);
}

/**
 * @param {object} reply The reply object
 * @param {string} reply.reference
 * @param {string} reply.type
 * @returns {string} The reference message to send
 */
export function createReferenceWords({ reference, type }) {
  const prompt = type === 'OPINIONATED' ? i18n.__(`See different views`) : i18n.__(`Source`);

  if (reference) return `${prompt}：\n${reference}`;
  return '\uDBC0\uDC85 ⚠️️ ' + i18n.__(`There is no %s for this response, please consider the credibility of the response.`, prompt) + '⚠️️  \uDBC0\uDC85';
}

/**
 * prefilled text for reasons
 */
export const REASON_PREFIX = '💁 ' + i18n.__(`My reason is:`) + '\n';
export const DOWNVOTE_PREFIX = '💡 ' + i18n.__('I feel that the response did not help and can be improved like this:') + ' \n';

/**
 * @param {string} state The current state
 * @param {string} text The prompt text
 * @param {string} prefix The prefix to use in the result text
 * @param {number} issuedAt The issuedAt that created this URL
 * @returns {string}
 */
export function getLIFFURL(state, text, prefix, issuedAt) {
  return `${process.env.LIFF_URL}?state=${state}&text=${encodeURIComponent(
    ellipsis(text, 10)
  )}&prefix=${encodeURIComponent(prefix)}&issuedAt=${issuedAt}`;
}

/**
 * @param {string} state The current state
 * @param {string} text The prompt text
 * @param {string} prefix The prefix to use in the result text
 * @param {string} issuedAt The current issuedAt
 * @returns {array} an array of reply message instances
 */
export function createAskArticleSubmissionReply(state, text, prefix, issuedAt) {
  const altText =
    '【' + i18n.__(`Send a message to the public database?`) + '】\n' +
    i18n.__(`If this is a \"transfer message\" and you feel that this is likely to be a \"rumor\", please send this message to the public database for documentation and acknowledgment.`) + '\n' +
    '\n' +
    i18n.__(`Although you will not receive the verification results immediately, you can help those who also receive this message in the future.`) + ' \n' +
    '\n' +
    i18n.__(`Please complete the operation on your 📱 smartphone.`);

  return [
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
              text: '🥇 ' + i18n.__(`Be the first person in the world to return this message`),
              weight: 'bold',
              color: '#009900',
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
                i18n.__(`There is currently no message in your database. If this is a \"transfer message\" and you think it is likely to be a \"rumor\"`),
              wrap: true,
            },
            {
              type: 'text',
              text: i18n.__(`Please click \"🆕 to enter the database\" to open this message and let the good people check and reply.`),
              color: '#009900',
              wrap: true,
            },
            {
              type: 'text',
              text:
                i18n.__(`Although you will not receive the verification results immediately, you can help those who also receive this message in the future.`),
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
                label: '🆕 ' + i18n.__(`Send to the database`),
                uri: getLIFFURL(state, text, prefix, issuedAt),
              },
            },
          ],
        },
        styles: {
          body: {
            separator: true,
          },
        },
      },
    },
  ];
}

export function isNonsenseText(/* text */) {
  // return text.length < 20;
  return false; // according to 20181017 meeting note, we remove limitation and observe
}

/**
 * @param {string} text
 * @param {number} limit
 * @return {string} if the text length is lower than limit, return text; else, return
 *                  text with ellipsis.
 */
export function ellipsis(text, limit, ellipsis = '⋯⋯') {
  if (splitter.countGraphemes(text) < limit) return text;

  return (
    splitter
      .splitGraphemes(text)
      .slice(0, limit - ellipsis.length)
      .join('') + ellipsis
  );
}

const SITE_URL = process.env.SITE_URL || 'https://cofacts.g0v.tw';

/**
 * @param {string} articleId
 * @returns {string} The article's full URL
 */
export function getArticleURL(articleId) {
  return `${SITE_URL}/article/${articleId}`;
}

/**
 * @param {string} articleUrl
 * @param {string} reason
 * @returns {object} Reply object with sharing buttings
 */
export function createArticleShareReply(articleUrl, reason) {
  return {
    type: 'template',
    altText:
      i18n.__(`Far away relatives are not as good as neighbors.`) + '🌟' + i18n.__(`Asking relatives and friends is always right. Share the message to your friends, maybe someone can help you!`),
    template: {
      type: 'buttons',
      actions: [
        {
          type: 'uri',
          label: 'LINE ' + i18n.__(`Group`),
          uri: `line://msg/text/?${encodeURIComponent(
            `${i18n.__("The idea that I received this message is")} ：\n${ellipsis(
              reason,
              60
            )}\n\n ${i18n.__("Please help me see if this is true or not")} ：${articleUrl}`
          )}`,
        },
        {
          type: 'uri',
          label: i18n.__(`Facebook`),
          uri: `https://www.facebook.com/dialog/share?openExternalBrowser=1&app_id=${
            process.env.FACEBOOK_APP_ID
          }&display=popup&quote=${encodeURIComponent(
            ellipsis(reason, 70)
          )}&hashtag=${encodeURIComponent(
            i18n.__("#CofactsSolve")
          )}&href=${encodeURIComponent(articleUrl)}`,
        },
      ],
      title: i18n.__(`Far away relatives are not as good as neighbors.`) + '🌟' + i18n.__(`It's always right to ask friends and relatives.`),
      text: i18n.__(`Maybe there are people in your friends who can solve your problems!`) + '\n' + i18n.__(`Who do you want Call-out?`),
    },
  };
}

/**
 * possible sources of incoming articles
 */
export const ARTICLE_SOURCES = [
  i18n.__("Relatives pass"),
  i18n.__("Colleagues pass"),
  i18n.__("Friend transfer"),
  i18n.__("Input by yourself"),
];
