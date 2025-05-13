import request from 'supertest';
import { Express } from 'express';
import { RESTClient, TxAPI, MoveAPI } from '@initia/initia.js';

// Mock the dependencies
jest.mock('@initia/initia.js', () => {
  return {
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
      apiRequester: {}
    })),
    TxAPI: jest.fn().mockImplementation(() => ({
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
    })),
    MoveAPI: jest.fn().mockImplementation(() => ({
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
      })
    }))
  };
});

// Import the app module
let app: Express;

describe('API Routes', () => {
  beforeAll(() => {
    // Dynamically import the app to ensure mocks are set up first
    jest.isolateModules(() => {
      const { app: testApp } = require('../../src/app');
      app = testApp;
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
    });
  });

  describe('GET /v1', () => {
    it('should return ledger info', async () => {
      const response = await request(app).get('/v1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chain_id', 1);
      expect(response.body).toHaveProperty('ledger_version', '1000');
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
      expect(response.body.transactions).toHaveLength(1);
      expect(response.body.transactions[0]).toHaveProperty('hash', 'mock-tx-hash-1');
      expect(response.body.transactions[0]).toHaveProperty('events');
      expect(response.body.transactions[0].events).toHaveLength(1);
      expect(response.body.transactions[0].events[0]).toHaveProperty('type', '0x1::coin::Transfer');
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

  describe('Fallback route', () => {
    it('should return 404 for unmatched routes', async () => {
      const response = await request(app).get('/non-existent-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('error_code', 'not_supported');
    });
  });
});
