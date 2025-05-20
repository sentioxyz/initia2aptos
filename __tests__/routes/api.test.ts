import request from 'supertest';
import { Express } from 'express';
import { RESTClient, TxAPI, MoveAPI } from '@initia/initia.js';

// Mock axios-cache-interceptor
jest.mock('axios-cache-interceptor', () => {
  return {
    buildMemoryStorage: jest.fn().mockImplementation(() => ({})),
    setupCache: jest.fn().mockImplementation((axios) => axios)
  };
});

jest.mock('@initia/initia.js', () => {
  // Mock APIRequester class
  class MockAPIRequester {
    endpoint: string;
    constructor(endpoint: string) {
      this.endpoint = endpoint;
    }
  }

  return {
    APIRequester: MockAPIRequester,
    RESTClient: jest.fn().mockImplementation(() => ({
      tendermint: {
        blockInfo: jest.fn().mockImplementation((height?: number) => {
          if (height === 123) {
            return {
              block_id: { hash: 'mock-block-hash-123' },
              block: {
                header: {
                  height: '123',
                  time: '2023-01-01T12:00:00.000Z'
                }
              }
            };
          }

          return {
            block_id: { hash: 'mock-block-hash' },
            block: {
              header: {
                height: '1000',
                time: '2023-01-01T12:00:00.000Z'
              }
            }
          };
        })
      },
      apiRequester: {},
      tx: {
        txInfosByHeight: jest.fn().mockImplementation((height: number) => {
          if (height === 123) {
            return [
              {
                height: 123,
                txhash: 'mock-tx-hash-1',
                timestamp: '2023-01-01T12:00:00.000Z',
                gas_used: 1000,
                gas_wanted: 2000,
                tx: {
                  body: {
                    messages: [
                      { sender: 'init1YW5lcg==' }
                    ]
                  }
                },
                events: [
                  {
                    type: 'move',
                    attributes: [
                      { key: 'type_tag', value: '0x1::coin::Transfer' },
                      { key: 'data', value: '{"amount":"100"}' }
                    ]
                  }
                ]
              }
            ];
          }
          return [];
        })
      },
      move: {
        modules: jest.fn().mockImplementation((address: string) => {
          return [
            [
              {
                abi: JSON.stringify({ name: 'TestModule', functions: [] }),
                raw_bytes: 'mock-bytecode'
              }
            ],
            { next_key: undefined }
          ];
        }),
        module: jest.fn().mockImplementation(() => ({
          abi: JSON.stringify({ name: 'TestModule', functions: [] }),
          raw_bytes: 'mock-bytecode'
        })),
        resource: jest.fn().mockImplementation(() => ({
          type: 'test::resource::Type',
          data: { value: 100 }
        })),
        view: jest.fn().mockImplementation((address: string, module: string, func: string, typeArgs: string[], args: any[]) => ({
          data: { result: 'mock-view-result' }
        }))
      }
    }))
  };
});

// Import the createApp function
import { createApp } from '../../src/app';

let app: Express;

describe('API Routes', () => {
  beforeAll(() => {
    // Create the app with default config
    app = createApp({
      port: '3000',
      chainId: 'test-chain',
      endpoint: 'http://test-endpoint',
      cacheEnabled: false
    });
  });

  describe('GET /', () => {
    it('should return welcome message and available endpoints', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Welcome to Initia2Aptos Bridge API');
      expect(response.body).toHaveProperty('endpoints');
      expect(response.body.endpoints).toHaveProperty('nodeInfo', '/v1');
      expect(response.body.endpoints).toHaveProperty('blockByHeight', '/v1/blocks/by_height/:height');
      expect(response.body.endpoints).toHaveProperty('viewFunction', '/v1/view');
    });
  });

  describe('GET /v1', () => {
    it('should return ledger info', async () => {
      const response = await request(app).get('/v1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chain_id', 1);
      expect(response.body).toHaveProperty('ledger_version', '10000000');
      expect(response.body).toHaveProperty('ledger_timestamp');
      expect(response.body).toHaveProperty('node_role');
    });
  });

  describe('GET /v1/blocks/by_height/:height', () => {
    it('should return block data for valid height', async () => {
      const response = await request(app).get('/v1/blocks/by_height/123');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('block_height', '123');
      expect(response.body).toHaveProperty('block_hash', 'mock-block-hash-123');
      expect(response.body).toHaveProperty('transactions');
      expect(response.body.transactions).toHaveLength(2);
      expect(response.body.transactions[1]).toHaveProperty('hash', 'mock-tx-hash-1');
      expect(response.body.transactions[1]).toHaveProperty('events');
      expect(response.body.transactions[1].events).toHaveLength(1);
      expect(response.body.transactions[1].events[0]).toHaveProperty('type', '0x1::coin::Transfer');
    });

    it('should return 400 for invalid height parameter', async () => {
      const response = await request(app).get('/v1/blocks/by_height/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message', 'Invalid height parameter. Must be a valid number.');
    });
  });

  describe('GET /v1/accounts/:address/modules', () => {
    it('should return modules for an account', async () => {
      const response = await request(app).get('/v1/accounts/0x123/modules');

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('abi');
      expect(response.body[0]).toHaveProperty('bytecode', 'mock-bytecode');
    });
  });

  describe('POST /v1/view', () => {
    it('should handle JSON view function requests', async () => {
      const response = await request(app)
        .post('/v1/view')
        .send({
          function: '0x1::coin::module_function',
          type_arguments: ['0x1::aptos_coin::AptosCoin'],
          arguments: ['0x123']
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result', 'mock-view-result');
    });

    it('should handle BCS-encoded view function requests with 501 Not Implemented', async () => {
      const response = await request(app)
        .post('/v1/view')
        .set('Content-Type', 'application/x.aptos.view_function+bcs')
        .send(Buffer.from('mock-bcs-data'));

      expect(response.status).toBe(501);
      expect(response.body).toHaveProperty('error_code', 'not_implemented');
    });
  });

  describe('Fallback route', () => {
    it('should return 404 for unmatched routes', async () => {
      const response = await request(app).get('/non-existent-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('error_code', 'not_supported');
    });
  });
});
