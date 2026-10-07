# Security Model

Remote Clinic is a local static app.

Security-relevant choices:

- no real patient data
- no secrets required
- no backend service
- no remote analytics
- save data stored in browser localStorage
- exports generated client-side
- patient text treated as untrusted simulation data

If optional local AI runtimes are added, model prompts should continue to separate system instructions from patient-generated text.
