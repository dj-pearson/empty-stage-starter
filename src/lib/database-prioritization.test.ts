import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockQueryLocalDb = vi.fn();
const mockQueryOpenFoodFacts = vi.fn();
const mockQueryUsda = vi.fn();

describe('queryDatabases', () => {
  beforeEach(async () => {
    vi.doMock('./local-db', () => ({ queryLocalDb: mockQueryLocalDb }));
    vi.doMock('./open-food-facts', () => ({ queryOpenFoodFacts: mockQueryOpenFoodFacts }));
    vi.doMock('./usda', () => ({ queryUsda: mockQueryUsda }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should query databases in the correct priority order', async () => {
    const { queryDatabases } = await import('./database-prioritization');
    
    mockQueryLocalDb.mockResolvedValue(null);
    mockQueryOpenFoodFacts.mockResolvedValue(null);
    mockQueryUsda.mockResolvedValue({ name: 'USDA Food' });

    await queryDatabases('12345');

    const callOrder = [
      mockQueryLocalDb,
      mockQueryOpenFoodFacts,
      mockQueryUsda,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    
    expect(callOrder).toEqual([1, 2, 3]);
  });
});
