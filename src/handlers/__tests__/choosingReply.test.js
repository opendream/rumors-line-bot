jest.mock('../../gql');

import choosingReply from '../choosingReply';
import * as apiResult from '../__fixtures__/choosingReply';
import gql from '../../gql';

describe('should select reply by replyId', async () => {
  const params = {
    data: {
      searchedText: '貼圖',
      foundArticleIds: [
        'AWDZYXxAyCdS-nWhumlz',
        '5483323992880-rumor',
        'AV-Urc0jyCdS-nWhuity',
        'AVsh8u7StKp96s659Dgq',
      ],
      selectedArticleId: 'AWDZYXxAyCdS-nWhumlz',
      foundReplyIds: ['AWDZeeV0yCdS-nWhuml8'],
    },
    state: 'CHOOSING_REPLY',
    event: {
      type: 'postback',
      input: 1,
      timestamp: 1518964687709,
      postback: { data: '{"input":1,"issuedAt":1518964675191}' },
    },
    issuedAt: 1518964688672,
    userId: 'Uaddc74df8a3a176b901d9d648b0fc4fe',
    replies: [
      {
        type: 'text',
        text:
          '這篇訊息有：\n0 則回應認為其 ❌ 含有不實訊息\n0 則回應認為其 ✅ 含有真實訊息\n0 則回應認為其 💬 含有個人意見\n1 則回應認為其 ⚠️️ 不在查證範圍\n',
      },
    ],
    isSkipUser: false,
  };

  it('should handle the case with just one reply', async () => {
    gql.__push(apiResult.oneReply);
    expect(await choosingReply(params)).toMatchSnapshot();
  });

  it('should handle the case with multiple replues', async () => {
    gql.__push(apiResult.oneReply);
    params.data.foundReplyIds.push('BVDZeeV0yCdS-nWhuml8');
    params.replies[0].text =
      '這篇訊息有：\n0 則回應認為其 ❌ 含有不實訊息\n0 則回應認為其 ✅ 含有真實訊息\n1 則回應認為其 💬 含有個人意見\n1 則回應認為其 ⚠️️ 不在查證範圍\n';
    expect(await choosingReply(params)).toMatchSnapshot();
  });
});

it('should handle invalid reply ids', async () => {
  gql.__push(apiResult.oneReply);

  const params = {
    data: {
      searchedText: '貼圖',
      foundArticleIds: [
        'AWDZYXxAyCdS-nWhumlz',
        '5483323992880-rumor',
        'AV-Urc0jyCdS-nWhuity',
        'AVsh8u7StKp96s659Dgq',
      ],
      selectedArticleId: 'AWDZYXxAyCdS-nWhumlz',
      foundReplyIds: ['AWDZeeV0yCdS-nWhuml8'],
    },
    state: 'CHOOSING_REPLY',
    event: {
      type: 'text',
      input: '123',
      timestamp: 1518964687709,
    },
    issuedAt: 1518964688672,
    userId: 'Uaddc74df8a3a176b901d9d648b0fc4fe',
    replies: [
      {
        type: 'text',
        text:
          '這篇訊息有：\n0 則回應認為其 ❌ 含有不實訊息\n0 則回應認為其 ✅ 含有真實訊息\n0 則回應認為其 💬 含有個人意見\n1 則回應認為其 ⚠️️ 不在查證範圍\n',
      },
    ],
    isSkipUser: false,
  };

  expect(await choosingReply(params)).toMatchSnapshot();
});

it('should handle invalid params', async () => {
  gql.__push(apiResult.oneReply);

  const params = {
    data: {
      searchedText: '貼圖',
      foundArticleIds: [
        'AWDZYXxAyCdS-nWhumlz',
        '5483323992880-rumor',
        'AV-Urc0jyCdS-nWhuity',
        'AVsh8u7StKp96s659Dgq',
      ],
      selectedArticleId: 'AWDZYXxAyCdS-nWhumlz',
    },
    state: 'CHOOSING_REPLY',
    event: {
      type: 'text',
      input: '123',
      timestamp: 1518964687709,
    },
    issuedAt: 1518964688672,
    userId: 'Uaddc74df8a3a176b901d9d648b0fc4fe',
    replies: [
      {
        type: 'text',
        text:
          '這篇訊息有：\n0 則回應認為其 ❌ 含有不實訊息\n0 則回應認為其 ✅ 含有真實訊息\n0 則回應認為其 💬 含有個人意見\n1 則回應認為其 ⚠️️ 不在查證範圍\n',
      },
    ],
    isSkipUser: false,
  };

  await expect(choosingReply(params)).rejects.toThrow();
});

afterEach(() => {
  gql.__reset();
});
