import i18n from '../i18n';

export default function defaultState(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  replies = [
    {
      type: 'text',
      text: i18n.__(`We don't understand QQ`) + '\n' + i18n.__(`Heroes, please come back.`),
    },
  ];
  state = '__INIT__';
  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
