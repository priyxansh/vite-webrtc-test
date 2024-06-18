import { BrowserRouter, Route, Routes } from "react-router-dom";
import Room from "./Room";
import SocketProvider from "./SocketProvider";

type AppProps = {};

const App = ({}: AppProps) => {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<h1>Home</h1>} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
};

export default App;
