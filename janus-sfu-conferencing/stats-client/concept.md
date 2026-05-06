#### Concept

- The server has a stats table. I need a client to be able to view the stats of a video conference session.
- The stats have 3 types -
    - The connection stats, like the ICE candadites, selected pair of candidates, negotitated SDP codecs, relay server usage, etc
    - The conference health stats, like the health of the streams, bitrate, packets lost, etc
    - The change events, like disconnections, reconnections, failed connections, reasons for those, etc. 
- I want to be able to view the stats of a conference session in an intuitive way.


#### Requirements

- Query the rooms table, get a list of all rooms.
- Show the rooms in a UI. Rooms will be selectable.
- Once a room is selected, shwo the media sessions/rooms of the room in a selectable list.
- Show a back button at the top to go back to the rooms list.
- Once a media session is selected, show the participants of the session in an accordion.
- Once a participant is selected, show the handles of that participant in the expanded accordion.
- Stats are associated with a handle, and show the stats of each handle in below it. 
- Keep in mind that the stats are of 3 main types, so show in an intuitive way. 
- The health metrics needs charts for them. Good to use a libary like Apache ECharts.
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
