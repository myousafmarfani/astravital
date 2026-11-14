# Communications

The communications outbox stores structured local messages with recipient role, priority, retry count, and transmission state. The current adapter is intentionally simulated: queued messages remain local and are never described as transmitted or acknowledged.

Production deployment needs an approved local/ground adapter, encryption, idempotent delivery, authenticated acknowledgements, and audit records.
