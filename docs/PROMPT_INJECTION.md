# Prompt Injection

Some synthetic patient records include adversarial-looking text, such as requests to mark a referral complete.

The structured AI layer treats that content as patient text, not as an instruction.

Tests cover this behavior at the simulation layer. Future local LLM integration should preserve this rule by quoting patient text as data and requiring source-event evidence for every claim.
