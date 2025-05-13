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
```

## API Endpoints

- `/v1` - Returns Initia node info in Aptos format
- `/v1/blocks/by_height/:height` - Returns block data by height in Aptos format
- `/v1/accounts/:address/modules` - Returns account modules

## Testing

Run the tests with:

```bash
pnpm test
```

Run tests with coverage:

```bash
pnpm test:coverage
```

