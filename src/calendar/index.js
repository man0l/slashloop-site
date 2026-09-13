// Reusable scheduled-posts calendar — public surface.
//
// Copy this folder into a host app (or publish it) and render:
//   <CalendarView adapter={adapter} onError={toast} />
// The host implements the adapter (see ./adapter.js for the contract and
// createMockAdapter for tests/demos); src/lib/social.js in this repo wires
// it to mcp.slashloop.dev. Styling assumes Tailwind.

export { CalendarView } from "./CalendarView.jsx";
export { ScheduleDrawer } from "./ScheduleDrawer.jsx";
export { createMockAdapter } from "./adapter.js";
export { providerMeta, stateStyle } from "./providerMeta.js";
export { monthGrid, toLocalInputValue, fromLocalInputValue, moveEpochToDay, dayStartEpoch } from "./dates.js";
