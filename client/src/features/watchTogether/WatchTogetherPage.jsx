import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SignInButton } from "@clerk/clerk-react";
import {
  ArrowLeft,
  Copy,
  Film,
  LoaderCircle,
  Radio,
  Settings2,
  Share2,
  UsersRound,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAppContext } from "../../context/AppContextCore";
import SourceSetup from "./components/SourceSetup";
import MediaStage from "./components/MediaStage";
import ParticipantsPanel from "./components/ParticipantsPanel";
import RoomCallPanel from "./components/RoomCallPanel";
import WatchChat from "./components/WatchChat";
import { useRoomCall } from "./hooks/useRoomCall";
import { useWatchRoom } from "./hooks/useWatchRoom";

const cleanRoomCode = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

const getInvitationRoomCode = (value) => {
  const input = String(value || "").trim();
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/watch-together\/([^/?#]+)/i);
    if (match?.[1]) return cleanRoomCode(match[1]);
  } catch {
    // A room code is not a URL, so it is handled by the normalizer below.
  }
  return cleanRoomCode(input);
};

const copyText = async (value) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some browsers expose Clipboard but reject it because of page permissions.
    }
  }

  const fallback = document.createElement("textarea");
  fallback.value = value;
  fallback.setAttribute("readonly", "");
  fallback.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  if (!copied) throw new Error("Copy is not available in this browser.");
};

const pageShell = "min-h-screen px-6 md:px-16 lg:px-24 xl:px-36 pt-30 pb-20";

const SignInRequired = () => (
  <main className={`${pageShell} flex items-center justify-center`}>
    <section className="w-full max-w-md border border-white/10 bg-white/[0.025] p-6 rounded-lg text-center">
      <UsersRound className="w-6 h-6 mx-auto text-primary" />
      <h1 className="mt-4 text-2xl font-semibold">Watch Together</h1>
      <p className="mt-2 text-sm text-gray-400">Sign in to create a room or join your friends.</p>
      <SignInButton mode="modal">
        <button className="mt-6 h-11 px-5 bg-primary hover:bg-primary-dull transition rounded-lg font-medium cursor-pointer">Sign in</button>
      </SignInButton>
    </section>
  </main>
);

const WatchTogetherLobby = ({ user, axios, getToken }) => {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  const createRoom = async (media) => {
    setCreating(true);
    try {
      const { data } = await axios.post(
        "/api/watch-together/rooms",
        {
          media,
          displayName: user.fullName || user.firstName || "Movie fan",
          image: user.imageUrl || "",
        },
        { headers: { Authorization: `Bearer ${await getToken()}` } },
      );
      if (!data.success) throw new Error(data.message || "Could not create the room.");
      toast.success("Your room is ready.");
      navigate(`/watch-together/${data.room.code}`);
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = (event) => {
    event.preventDefault();
    const roomCode = getInvitationRoomCode(joinCode);
    if (roomCode.length < 6) {
      setJoinError("Enter the room code from the invite link.");
      return;
    }
    navigate(`/watch-together/${roomCode}`);
  };

  return (
    <main className={pageShell}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-primary text-sm"><Radio className="w-4 h-4" /> Watch Together</div>
            <h1 className="mt-2 text-3xl font-semibold">Start a shared room</h1>
          </div>
          <p className="text-sm text-gray-400">Signed in as {user.fullName || user.firstName || "Movie fan"}</p>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
          <section className="border border-white/10 bg-white/[0.025] p-5 md:p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-9 h-9 flex items-center justify-center bg-primary/15 text-primary rounded-lg"><Film className="w-4 h-4" /></span>
              <div>
                <h2 className="font-medium">Room video</h2>
                <p className="text-sm text-gray-400 mt-0.5">Choose one source to begin.</p>
              </div>
            </div>
            <SourceSetup onSubmitMedia={createRoom} submitting={creating} actionLabel="Create watch room" />
          </section>

          <aside className="border border-white/10 bg-white/[0.025] p-5 rounded-lg">
            <h2 className="font-medium">Join a room</h2>
            <p className="text-sm text-gray-400 mt-1">Paste a shared link or room code.</p>
            <form onSubmit={joinRoom} className="mt-5 space-y-3">
              <input
                value={joinCode}
                onChange={(event) => { setJoinCode(cleanRoomCode(event.target.value)); setJoinError(""); }}
                placeholder="ROOM CODE"
                className="w-full h-11 border border-white/10 bg-black/30 px-3 rounded-lg outline-none uppercase tracking-[0.12em] text-sm focus:border-primary"
                maxLength={12}
              />
              {joinError && <p className="text-xs text-red-300">{joinError}</p>}
              <button type="submit" className="w-full h-11 border border-white/20 hover:border-primary hover:bg-primary/10 transition rounded-lg text-sm font-medium cursor-pointer">Join room</button>
            </form>
            <div className="mt-6 pt-5 border-t border-white/10 text-sm text-gray-400 space-y-2">
              <p>Rooms include shared playback, chat, and a browser video call.</p>
              <p>Only the room creator controls playback and video changes.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
};

const RoomLoading = () => (
  <main className={`${pageShell} flex items-center justify-center`}>
    <LoaderCircle className="w-7 h-7 text-primary animate-spin" />
  </main>
);

const WatchRoomView = ({ roomCode, user, axios, getToken }) => {
  const navigate = useNavigate();
  const watchRoom = useWatchRoom({ roomCode, user, axios, getToken });
  const call = useRoomCall({ socket: watchRoom.socket, emitWithAck: watchRoom.emitWithAck });
  const [changingVideo, setChangingVideo] = useState(false);

  const copyRoomCode = async () => {
    try {
      await copyText(watchRoom.room.code);
      toast.success("Room code copied.");
    } catch {
      toast.error("Could not copy the room code.");
    }
  };

  const shareInvitation = async () => {
    const invitation = `${window.location.origin}/watch-together/${watchRoom.room.code}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Watch Together",
          text: `Join ${watchRoom.room.host.name}'s Watch Together room.`,
          url: invitation,
        });
        toast.success("Room link shared.");
        return;
      } catch (shareError) {
        if (shareError?.name === "AbortError") return;
      }
    }

    try {
      await copyText(invitation);
      toast.success("Room link copied.");
    } catch {
      toast.error("Could not copy the room link.");
    }
  };

  const changeMedia = async (media) => {
    await watchRoom.updateMedia(media);
    setChangingVideo(false);
    toast.success("The room video was changed.");
  };

  if (watchRoom.isLoading) return <RoomLoading />;

  if (!watchRoom.room) {
    return (
      <main className={`${pageShell} flex items-center justify-center`}>
        <section className="w-full max-w-md border border-white/10 bg-white/[0.025] p-6 rounded-lg text-center">
          <h1 className="text-xl font-semibold">Room unavailable</h1>
          <p className="mt-2 text-sm text-gray-400">{watchRoom.error || "This room could not be opened."}</p>
          <Link to="/watch-together" className="inline-flex mt-6 h-10 items-center px-4 bg-primary hover:bg-primary-dull transition rounded-lg text-sm font-medium">Back to Watch Together</Link>
        </section>
      </main>
    );
  }

  const { room } = watchRoom;
  const connectionLabel = watchRoom.connectionStatus === "connected"
    ? "Live"
    : watchRoom.connectionStatus === "error" ? "Offline" : "Reconnecting";

  return (
    <main className={pageShell}>
      <div className="max-w-[1500px] mx-auto">
        <header className="flex flex-wrap items-center gap-3 pb-6 border-b border-white/10">
          <button
            type="button"
            onClick={() => navigate("/watch-together")}
            title="Leave room"
            aria-label="Leave room"
            className="w-9 h-9 flex items-center justify-center border border-white/15 hover:border-white/40 transition rounded-lg cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-gray-400"><Radio className={`w-3.5 h-3.5 ${connectionLabel === "Live" ? "text-primary" : "text-amber-200"}`} /> {connectionLabel}</div>
            <h1 className="mt-1 truncate text-xl font-semibold">{room.host.name}'s room</h1>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400">
            <span>Code: <span className="font-mono tracking-[0.16em] text-gray-200">{room.code}</span></span>
            <button
              type="button"
              onClick={copyRoomCode}
              title="Copy room code"
              aria-label="Copy room code"
              className="w-8 h-8 flex items-center justify-center border border-white/15 hover:border-primary hover:bg-primary/10 transition rounded-lg cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={shareInvitation}
            className="h-10 px-3 flex items-center gap-2 border border-white/15 hover:border-primary hover:bg-primary/10 transition rounded-lg text-sm cursor-pointer"
          >
            <Share2 className="w-4 h-4" /> Share
          </button>
        </header>

        {watchRoom.error && watchRoom.connectionStatus !== "connected" && (
          <p className="mt-4 border border-amber-300/30 bg-amber-300/10 px-3 py-2 rounded-lg text-sm text-amber-100">{watchRoom.error}</p>
        )}

        <div className="grid xl:grid-cols-[minmax(0,1fr)_22rem] gap-6 mt-6">
          <div className="min-w-0 space-y-4">
            <MediaStage room={room} onPlayback={watchRoom.updatePlayback} call={call} callActive={watchRoom.callActive} />
            {room.isHost && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setChangingVideo(true)}
                  className="h-10 px-3 flex items-center gap-2 border border-white/15 hover:border-primary hover:bg-primary/10 transition rounded-lg text-sm cursor-pointer"
                >
                  <Settings2 className="w-4 h-4" /> Change video
                </button>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <ParticipantsPanel
              participants={watchRoom.participants}
              currentUserId={user.id}
            />
            <RoomCallPanel callActive={watchRoom.callActive} call={call} />
            <WatchChat messages={watchRoom.messages} currentUserId={user.id} onSend={watchRoom.sendMessage} />
          </aside>
        </div>
      </div>

      {changingVideo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Change room video">
          <section className="w-full max-w-xl max-h-[90vh] overflow-y-auto border border-white/10 bg-[#111114] p-5 md:p-6 rounded-lg">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="font-medium">Change room video</h2>
                <p className="text-sm text-gray-400 mt-1">This restarts the shared playback at the beginning.</p>
              </div>
              <button
                type="button"
                onClick={() => setChangingVideo(false)}
                title="Close"
                aria-label="Close"
                className="w-9 h-9 shrink-0 flex items-center justify-center border border-white/15 hover:border-white/40 transition rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SourceSetup
              onSubmitMedia={changeMedia}
              actionLabel="Change room video"
              initialMedia={room.media}
            />
          </section>
        </div>
      )}
    </main>
  );
};

const WatchTogetherPage = () => {
  const { roomCode } = useParams();
  const { user, axios, getToken } = useAppContext();

  if (!user) return <SignInRequired />;
  if (roomCode) return <WatchRoomView roomCode={roomCode} user={user} axios={axios} getToken={getToken} />;
  return <WatchTogetherLobby user={user} axios={axios} getToken={getToken} />;
};

export default WatchTogetherPage;
