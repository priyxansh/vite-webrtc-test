import { useParams } from "react-router-dom";
import { useSocket } from "./SocketProvider";
import { useEffect, useState } from "react";

type RoomProps = {};

const Room = ({}: RoomProps) => {
  const { roomId } = useParams();
  const { socket } = useSocket();

  const [peers, setPeers] = useState<{ [key: string]: RTCPeerConnection }>({});
  const [streams, setStreams] = useState<{ [key: string]: MediaStream }>({});
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  useEffect(() => {
    const handleUserJoined = ({
      userId: _,
      users,
    }: {
      userId: string;
      users: string[];
    }) => {
      users.forEach((id) => {
        if (id !== socket.id && !peers[id]) {
          console.log("User joined", id);
          createPeerConnection(id, false);
        }
      });
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
        delete streams[userId];
        setPeers({ ...peers });
        setStreams({ ...streams });
      }
    };

    const handleOffer = async ({
      from,
      offer,
    }: {
      from: string;
      offer: RTCSessionDescriptionInit;
    }) => {
      const peer = createPeerConnection(from, true);
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("answer", { to: from, answer });
    };

    const handleAnswer = async ({
      from,
      answer,
    }: {
      from: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      const peer = peers[from];
      await peer.setRemoteDescription(new RTCSessionDescription(answer));
    };

    const handleIceCandidate = async ({
      from,
      candidate,
    }: {
      from: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const peer = peers[from];
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    };

    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);

    return () => {
      socket.off("user-joined", handleUserJoined);
      socket.off("user-left", handleUserLeft);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
    };
  }, [socket, peers, streams]);

  useEffect(() => {
    const init = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setMyStream(stream);
      socket.emit("join-room", { roomId });
    };

    init();
  }, [roomId, socket]);

  const createPeerConnection = (userId: string, isAnswerer: boolean) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302"] },
        {
          urls: "turn:numb.viagenie.ca",
          username: "webrtc@live.com",
          credential: "muazkh",
        },
      ],
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          to: userId,
          candidate: event.candidate,
        });
      }
    };

    peer.ontrack = (event) => {
      setStreams((prev) => ({ ...prev, [userId]: event.streams[0] }));
    };

    if (myStream) {
      myStream.getTracks().forEach((track) => {
        peer.addTrack(track, myStream);
      });
    }

    if (!isAnswerer) {
      peer.onnegotiationneeded = async () => {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit("offer", { to: userId, offer });
      };
    }

    setPeers((prev) => ({ ...prev, [userId]: peer }));
    return peer;
  };

  const exitCall = () => {
    Object.values(peers).forEach((peer) => {
      peer.close();
    });

    setPeers({});
    setStreams({});
    setMyStream(null);

    socket.emit("leave-room", { roomId });
  };

  const rejoinCall = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    setMyStream(stream);
    socket.emit("join-room", { roomId });
  };

  const toggleAudio = () => {
    if (myStream) {
      myStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
  };

  const toggleVideo = () => {
    if (myStream) {
      myStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      setIsScreenSharing(true);

      if (myStream) {
        const videoTrack = myStream.getVideoTracks()[0];
        myStream.removeTrack(videoTrack);
        videoTrack.stop();
        myStream.addTrack(screenStream.getVideoTracks()[0]);
      }

      Object.values(peers).forEach((peer) => {
        const sender = peer
          .getSenders()
          .find((s) => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(screenStream.getVideoTracks()[0]);
        }
      });
    } catch (error) {
      console.error("Error sharing screen: ", error);
    }
  };

  const stopScreenShare = () => {
    if (myStream) {
      myStream.getVideoTracks()[0].stop();
      exitCall()
      rejoinCall();
    }
    setIsScreenSharing(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-4">Room {roomId}</h1>
      <div className="flex space-x-4 mb-4">
        <button
          onClick={exitCall}
          className="px-4 py-2 bg-red-600 text-white rounded-lg"
        >
          Exit Call
        </button>
        {!myStream && (
          <button
            onClick={rejoinCall}
            className="px-4 py-2 bg-green-600 text-white rounded-lg"
          >
            Rejoin Call
          </button>
        )}
        {!isScreenSharing && (
          <button
            onClick={startScreenShare}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Share Screen
          </button>
        )}
        {isScreenSharing && (
          <button
            onClick={stopScreenShare}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg"
          >
            Stop Screen Share
          </button>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {myStream && (
          <div className="w-80 bg-white p-4 rounded-lg shadow-lg">
            <span className="block text-center font-semibold mb-2">
              My Stream
            </span>
            <video
              className="w-full rounded-lg mb-2"
              autoPlay
              playsInline
              muted
              ref={(video) => {
                if (video) {
                  video.srcObject = myStream;
                }
              }}
            />
            <div className="flex justify-between">
              <button
                onClick={toggleAudio}
                className="px-2 py-1 bg-blue-500 text-white rounded"
              >
                Toggle Audio
              </button>
              <button
                onClick={toggleVideo}
                className="px-2 py-1 bg-blue-500 text-white rounded"
              >
                Toggle Video
              </button>
            </div>
          </div>
        )}
        {Object.keys(streams).map((key) => (
          <div key={key} className="w-80 bg-white p-4 rounded-lg shadow-lg">
            <span className="block text-center font-semibold mb-2">
              {key}'s Stream
            </span>
            <video
              className="w-full rounded-lg"
              autoPlay
              playsInline
              ref={(video) => {
                if (video) {
                  video.srcObject = streams[key];
                }
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Room;
