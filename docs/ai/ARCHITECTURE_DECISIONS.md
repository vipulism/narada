# ADR-001

Decision:
RabbitMQ is event distributor, not importer.

Reason:
Keep ingestion deterministic.

Rejected:
Using RabbitMQ as file ingestion mechanism.

# ADR: External Sources Should Produce Events

## Decision

Connectors and importers should never directly trigger business workflows.

All external data must be converted into normalized events.

## Reason

- Keeps integrations replaceable
- Enables offline processing
- Allows multiple consumers
- Prevents tight coupling