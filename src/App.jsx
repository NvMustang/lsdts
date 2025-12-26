import React from "react";
import Create from "./pages/Create.jsx";
import Invite from "./pages/Invite.jsx";

const App = () => {
  const path = window.location.pathname;
  const isInvite = path.startsWith("/p/");
  const token = isInvite ? decodeURIComponent(path.slice(3)) : "";

  return (
    <div className="app-shell">
      {isInvite ? <Invite token={token} /> : <Create />}
    </div>
  );
};

export default App;

