'use strict';

// **Node.js convention:** Register event listener on the specific event
// which interests you. The following is the list of events that can be watched:
//
// * `connected` - Client is connected and ready.
// * `connectedReadOnly` - Client is connected to a readonly server.
// * `disconnected` - The connection between client and server is dropped.
// * `expired` - The client session is expired.
// * `authenticationFailed` - Failed to authenticate with the server.
//
// Note: some events (e.g. `connected` or `disconnected`) maybe be emitted more
// than once during the client life cycle.
module.exports = [
  'connected',
  'connectedReadOnly',
  'disconnected',
  'expired',
  'authenticationFailed',
];
