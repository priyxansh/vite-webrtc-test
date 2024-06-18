import { useParams } from "react-router-dom";
import { useSocket } from "./SocketProvider";
import { useEffect, useRef, useState } from "react";

type RoomProps = {};

const Room = ({}: RoomProps) => {
  const { roomId } = useParams();
  const { socket } = useSocket();

  const [isBroadcaster, setIsBroadcaster] = useState(false);
  const [broadcasterUserId, setBroadcasterUserId] = useState<string | null>(
    null
  );
  const [viewerUserIds, setViewerUserIds] = useState<string[]>([]);

  const broadcasterPeerRef = useRef<RTCPeerConnection | null>(null);
  const viewerPeersRef = useRef<{ [key: string]: RTCPeerConnection }>({});

  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const handleUserJoined = (data: {
    userId: string;
    isBroadcaster: boolean;
    broadcasterId: string;
  }) => {
    if (data.userId === data.broadcasterId) {
      setIsBroadcaster(data.isBroadcaster);
    }

    if (isBroadcaster && !data.isBroadcaster) {
      setViewerUserIds((prev) => [...prev, data.userId]);
    }

    if (!isBroadcaster) {
      setBroadcasterUserId(data.broadcasterId);
    }
  };

  const handleOffer = async (data: {
    from: string;
    offer: RTCSessionDescription;
  }) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: ["stun:stun.l.google.com:19302"],
        },
        {
          urls: "turn:numb.viagenie.ca",
          username: "webrtc@live.com",
          credential: "muazkh",
        },
      ],
    });
    broadcasterPeerRef.current = peer;

    await peer.setRemoteDescription(data.offer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    peer.addEventListener("track", (event) => {
      setRemoteStream(event.streams[0]);
      console.log(event.streams[0].getTracks(), "remote tracks");
    });

    peer.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        console.log("ice-candidate");
        socket.emit("ice-candidate", {
          to: broadcasterUserId,
          candidate: event.candidate,
        });
      }
    });

    socket.emit("answer", {
      to: data.from,
      answer,
    });
  };

  const handleAnswer = async (data: {
    from: string;
    answer: RTCSessionDescription;
  }) => {
    const peer = viewerPeersRef.current[data.from];

    if (!peer) {
      console.log("Peer not found");
      return;
    }

    await peer.setRemoteDescription(data.answer);

    if (!myStream) {
      console.log("My stream not found");
      return;
    }

    const tracks = myStream.getTracks();

    tracks.forEach((track) => {
      peer.addTrack(track, myStream);
    });
  };

  const handleNegotiationNeeded = async (data: {
    from: string;
    offer: RTCSessionDescription;
  }) => {
    if (!broadcasterPeerRef.current) {
      console.log("Broadcaster peer not found");
      return;
    }

    await broadcasterPeerRef.current.setRemoteDescription(data.offer);
    const answer = await broadcasterPeerRef.current.createAnswer();
    await broadcasterPeerRef.current.setLocalDescription(answer);

    socket.emit("negotiation-done", {
      to: data.from,
      answer,
    });
  };

  const handleNegotiationDone = async (data: {
    from: string;
    answer: RTCSessionDescription;
  }) => {
    if (!viewerPeersRef.current[data.from]) {
      console.log("Viewer peer not found");
      return;
    }

    console.log(viewerPeersRef.current[data.from]);

    await viewerPeersRef.current[data.from].setRemoteDescription(data.answer);
  };

  const handleIceCandidate = async (data: {
    from: string;
    candidate: RTCIceCandidate;
  }) => {
    console.log({ data, broadcasterUserId, viewerPeersRef, isBroadcaster });
    if (isBroadcaster) {
      const peer = viewerPeersRef.current[data.from];

      if (!peer) {
        console.log("Peer not found");
        return;
      }

      await peer.addIceCandidate(data.candidate);
    } else {
      if (!broadcasterPeerRef.current) {
        console.log("Broadcaster peer not found");
        return;
      }

      await broadcasterPeerRef.current.addIceCandidate(data.candidate);
    }
  };

  useEffect(() => {
    socket.on("user-joined", handleUserJoined);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("negotiation-needed", handleNegotiationNeeded);
    socket.on("negotiation-done", handleNegotiationDone);
    socket.on("ice-candidate", handleIceCandidate);

    return () => {
      socket.off("user-joined", handleUserJoined);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("negotiation-needed", handleNegotiationNeeded);
      socket.off("negotiation-done", handleNegotiationDone);
      socket.off("ice-candidate", handleIceCandidate);
    };
  }, [
    socket,
    handleUserJoined,
    handleOffer,
    handleAnswer,
    handleNegotiationNeeded,
    handleNegotiationDone,
    handleIceCandidate,
  ]);

  useEffect(() => {
    if (isBroadcaster) {
      navigator.mediaDevices
        .getUserMedia({
          video: true,
          audio: true,
        })
        .then((stream) => {
          setMyStream(stream);
        });
    }
  }, [isBroadcaster]);

  useEffect(() => {
    socket.emit("join-room", { roomId });
  }, [socket]);

  const startBroadcast = async () => {
    if (!myStream) {
      return;
    }

    viewerUserIds.forEach(async (userId) => {
      const peer = new RTCPeerConnection({
        iceServers: [
          {
            urls: ["stun:stun.l.google.com:19302"],
          },
          {
            urls: "turn:numb.viagenie.ca",
            username: "webrtc@live.com",
            credential: "muazkh",
          },
        ],
      });
      viewerPeersRef.current[userId] = peer;

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      peer.addEventListener("negotiationneeded", async () => {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        socket.emit("negotiation-needed", {
          to: userId,
          offer,
        });

        console.log("negotiationneeded");
      });

      peer.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
          console.log("ice-candidate");
          socket.emit("ice-candidate", {
            to: userId,
            candidate: event.candidate,
          });
        }
      });

      socket.emit("offer", {
        to: userId,
        offer,
      });
    });
  };

  useEffect(() => {
    console.log({ myStream, remoteStream });
  }, [myStream, remoteStream]);

  return (
    <div>
      Room {roomId}
      <div>
        {isBroadcaster ? (
          <button onClick={startBroadcast}>Start Broadcast</button>
        ) : null}
        {myStream ? (
          <div>
            <span>My stream</span>
            <video
              autoPlay
              playsInline
              muted
              ref={(video) => {
                if (video) {
                  video.srcObject = myStream;
                }
              }}
            />
          </div>
        ) : null}
        {remoteStream ? (
          <div>
            <span>Remote stream</span>
            <video
              autoPlay
              playsInline
              ref={(video) => {
                if (video) {
                  video.srcObject = remoteStream;
                }
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Room;
