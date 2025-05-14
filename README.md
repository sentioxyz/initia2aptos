# initia2aptos

## Description

A bridge API that maps Initia blockchain data to Aptos-compatible formats.

## Installation

```bash
pnpm install
```

## Usage

```bash
# Start the server
pnpm start

# Development mode
pnpm dev

# Start with custom options
pnpm start -- --port 4000 --cache-enabled true --cache-duration "10 minutes"
```

### Command Line Options

- `-p, --port <number>` - Port to run the server on (default: 3000)
- `-c, --chain-id <string>` - Chain ID for Initia (default: echelon-1)
- `-e, --endpoint <url>` - Indexer endpoint URL
- `--cache-enabled <boolean>` - Enable API response caching (default: true)
- `--cache-duration <string>` - Cache duration in plain English (default: "5 minutes")

## API Endpoints

### Main Endpoints

- `/v1` - Returns Initia node info in Aptos format
- `/v1/blocks/by_height/:height` - Returns block data by height in Aptos format
- `/v1/accounts/:address/modules` - Returns account modules

### Cache Management Endpoints

When caching is enabled, the following endpoints are available:

- `/api/cache/performance` - Returns cache performance statistics
- `/api/cache/index` - Returns the current cache index
- `/api/cache/clear` - Clears the entire cache
- `/api/cache/clear/:target` - Clears a specific target

## Testing

Run the tests with:

```bash
pnpm test
```

Run tests with coverage:

```bash
pnpm test:coverage
```

