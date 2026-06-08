#### Concept

- in the @client folder, we have a vidoe conferecning application that talks to the @server folder.
- In the @server folder, we have a webrtc stats processor that outputs JSON files in @process folder.
- In the stats-client app, we want to show the JSON data in the UI in an intuitive manner.

#### Requirements

- Query the rooms table, get a list of all rooms.
- Show the rooms in a UI. Rooms will be selectable.
- Once a room is selected, shwo the list of users in the room.
- Once a user is selected, open a new tab showing the webrtc stats of that user while he was in the call.
- We might need to add new GET endpoints in the server to support all of this

#### - UI
- Use React for the UI.
- Use CSS classes to style the UI.
- Keep the UI minimal, the focus is on the data, not the style.

#### - Coding standards
- Keep the code clean and readable.
- Dont create GOD like massive components
- Keep the code modular.
- Load data on demand. Dont load all the data at once.
