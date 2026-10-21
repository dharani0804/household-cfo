**1. Organization policy blocked ECR on a new account**
- **Task:** Push my container image to Amazon ECR.
- **Steps:** Created an ECR repository and ran `docker push` from my IAM user.
- **Expected vs. actual:** Expected the push to work. It was denied by a service control policy from an AWS Organizations setup I didn't know my new account had.
- **Severity:** High. It blocked deployment for about half a day.
- **Workaround:** Activated "advanced features" in Organizations (which can't be undone and removed my spend limits). A remaining policy then only allowed regional services in us-east-2, so I moved everything there.
- **Suggestion:** Name the denying policy in the error, and link to where it can be changed.

**2. CreateAgentRuntime denied for IAM users**
- **Task:** Create the AgentCore runtime for my MCP server.
- **Steps:** Ran `aws bedrock-agentcore-control create-agent-runtime` as an IAM user with AdministratorAccess.
- **Expected vs. actual:** Expected it to work. It was denied, and CloudTrail didn't say why. The same command worked from CloudShell.
- **Severity:** High. It cost about 2 hours.
- **Workaround:** Created and updated the runtime from CloudShell.
- **Suggestion:** Say which policy or condition denied the call.

**3. MCP client hung against AgentCore**
- **Task:** Connect my Alexa+ simulator to the MCP server on AgentCore with the MCP TypeScript SDK.
- **Steps:** Connected with the Streamable HTTP client, then called tools.
- **Expected vs. actual:** Expected tool calls to return. After connecting, the client's background GET stream seemed to block every later request on the session, while curl worked fine.
- **Severity:** High. It cost about an hour.
- **Workaround:** A custom `fetch` that answers GET with a 405, so the client skips the stream.
- **Suggestion:** Document GET stream support for MCP servers on AgentCore, and add an SDK option to turn the stream off.

**4. Missing use-case form came back as a 404**
- **Task:** Call Claude on Amazon Bedrock from the simulator.
- **Steps:** Called the Converse API with a Claude inference profile.
- **Expected vs. actual:** Expected a response. Got `ResourceNotFoundException` (404), which read like a wrong model ID. The real cause was the Anthropic use-case form not being submitted.
- **Severity:** Medium.
- **Workaround:** Found and submitted the form in the console.
- **Suggestion:** Return a 403 with a direct link to the form.

**5. Newest model not available, with no way to check up front**
- **Task:** Use the latest Claude model on Bedrock.
- **Steps:** Called it by its inference profile ID.
- **Expected vs. actual:** Expected it to work. Got "not available for this account".
- **Severity:** Medium.
- **Workaround:** Tried models one by one in a loop until I found ones that worked (Sonnet 4.5).
- **Suggestion:** A CLI command that lists the models this account can actually invoke.

**6. Alexa+ developer console says "Coming soon"**
- **Task:** Connect my MCP server to Alexa+ as an add-on.
- **Steps:** Signed in to the Alexa developer console.
- **Expected vs. actual:** Expected to register an MCP server. The console showed "Coming soon", and the CLI docs require access through an Alexa Solutions Architect.
- **Severity:** High for this track.
- **Workaround:** Built my own Alexa+ simulator with Claude on Bedrock, which the rules allow.
- **Suggestion:** Open the console, or provide a test sandbox, plus a reference setup for AgentCore with Alexa+ OAuth 2.1.

**7. One-hour Cognito tokens during development**
- **Task:** Test the deployed server many times a day.
- **Steps:** Got an access token with USER_PASSWORD_AUTH.
- **Expected vs. actual:** Tokens expire after an hour, so testing kept failing with 401s.
- **Severity:** Low.
- **Workaround:** Stored the password in the macOS Keychain, and wrote a one-line command to refresh the token.
- **Suggestion:** A documented dev-mode token flow for AgentCore testing.
