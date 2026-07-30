import { useState } from "react";
import {
  CheckCircle2,
  CloudUpload,
  HardDrive,
  Link,
  LoaderCircle,
  PlaySquare,
  Upload,
  Youtube,
} from "lucide-react";
import {
  connectGoogleDrive,
  getGoogleDriveVideo,
  isGoogleDriveConfigured,
  listGoogleDriveVideos,
  shareGoogleDriveFileWithRoom,
  uploadGoogleDriveVideo,
} from "../lib/googleDrive";
import { extractYouTubeId, formatBytes, MAX_GOOGLE_DRIVE_FILE_SIZE, toDriveMedia } from "../lib/media";

const SourceSetup = ({ onSubmitMedia, prepareDriveMedia, submitting = false, actionLabel = "Create room", initialMedia }) => {
  const [source, setSource] = useState(initialMedia?.source === "drive" ? "drive" : "youtube");
  const [youtubeUrl, setYoutubeUrl] = useState(initialMedia?.url || "");
  const [title, setTitle] = useState(initialMedia?.title || "");
  const [driveToken, setDriveToken] = useState("");
  const [driveFiles, setDriveFiles] = useState([]);
  const [selectedDriveFile, setSelectedDriveFile] = useState(null);
  const [shareWithRoom, setShareWithRoom] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [prepareStatus, setPrepareStatus] = useState("");
  const [error, setError] = useState("");

  const loadDriveFiles = async (token) => {
    const files = await listGoogleDriveVideos(token);
    setDriveFiles(files);
  };

  const connectDrive = async () => {
    setError("");
    setIsConnecting(true);
    try {
      const token = await connectGoogleDrive();
      setDriveToken(token);
      await loadDriveFiles(token);
    } catch (requestError) {
      setError(requestError.message || "Could not connect Google Drive.");
    } finally {
      setIsConnecting(false);
    }
  };

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!driveToken) {
      setError("Connect Google Drive before uploading a video.");
      return;
    }
    if (file.size > MAX_GOOGLE_DRIVE_FILE_SIZE) {
      setError("Videos can be up to 5 GB.");
      return;
    }

    setError("");
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const uploadedFile = await uploadGoogleDriveVideo({
        accessToken: driveToken,
        file,
        onProgress: setUploadProgress,
      });
      setDriveFiles((current) => [uploadedFile, ...current.filter(({ id }) => id !== uploadedFile.id)]);
      setSelectedDriveFile(uploadedFile);
      setTitle((current) => current || uploadedFile.name);
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload the video.");
    } finally {
      setIsUploading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (source === "youtube") {
      const youtubeId = extractYouTubeId(youtubeUrl);
      if (!youtubeId) {
        setError("Enter a valid YouTube video link.");
        return;
      }

      try {
        await onSubmitMedia({ source: "youtube", youtubeId, title });
      } catch (submitError) {
        setError(submitError.message || "Could not save this video.");
      }
      return;
    }

    if (!selectedDriveFile || !driveToken) {
      setError("Select a Google Drive video first.");
      return;
    }
    if (!shareWithRoom) {
      setError("Enable room sharing so everyone in this room can view the selected Drive file.");
      return;
    }

    try {
      let file = selectedDriveFile;
      await shareGoogleDriveFileWithRoom(driveToken, file.id);
      file = await getGoogleDriveVideo(driveToken, file.id);
      let media = { ...toDriveMedia(file), title: title || file.name };
      if (prepareDriveMedia) {
        setIsPreparing(true);
        setPrepareStatus("Checking this video for synchronized playback.");
        media = await prepareDriveMedia(media, setPrepareStatus);
      }
      await onSubmitMedia(media);
    } catch (submitError) {
      setError(submitError.message || "Could not save this Google Drive video.");
    } finally {
      setIsPreparing(false);
      setPrepareStatus("");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => { setSource("youtube"); setError(""); }}
          className={`min-h-26 border p-4 text-left transition cursor-pointer rounded-lg ${source === "youtube" ? "border-primary bg-primary/10" : "border-white/10 bg-white/[0.03] hover:border-white/30"}`}
        >
          <Youtube className="w-5 h-5 text-primary" />
          <span className="block mt-3 text-sm font-medium">YouTube</span>
          <span className="block text-xs text-gray-400 mt-1">Paste a video link</span>
        </button>
        <button
          type="button"
          onClick={() => { setSource("drive"); setError(""); }}
          className={`min-h-26 border p-4 text-left transition cursor-pointer rounded-lg ${source === "drive" ? "border-primary bg-primary/10" : "border-white/10 bg-white/[0.03] hover:border-white/30"}`}
        >
          <HardDrive className="w-5 h-5 text-primary" />
          <span className="block mt-3 text-sm font-medium">Google Drive</span>
          <span className="block text-xs text-gray-400 mt-1">Choose or upload a video</span>
        </button>
      </div>

      {source === "youtube" ? (
        <label className="block">
          <span className="text-sm text-gray-300">YouTube link</span>
          <span className="mt-2 flex items-center gap-3 border border-white/10 bg-black/30 px-3 rounded-lg focus-within:border-primary">
            <Link className="w-4 h-4 text-gray-500" />
            <input
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full h-11 bg-transparent outline-none text-sm"
              inputMode="url"
            />
          </span>
        </label>
      ) : (
        <div className="space-y-4">
          {!isGoogleDriveConfigured() ? (
            <div className="border border-amber-300/30 bg-amber-300/10 px-4 py-3 rounded-lg text-sm text-amber-100">
              Google Drive needs `VITE_GOOGLE_CLIENT_ID` before it can be connected.
            </div>
          ) : !driveToken ? (
            <button
              type="button"
              onClick={connectDrive}
              disabled={isConnecting}
              className="w-full min-h-12 flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-200 disabled:opacity-60 transition rounded-lg font-medium cursor-pointer disabled:cursor-not-allowed"
            >
              {isConnecting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
              Connect Google Drive
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-300">Your recent videos</p>
                <label className="inline-flex items-center gap-2 h-9 px-3 border border-white/15 hover:border-primary transition rounded-lg text-xs cursor-pointer">
                  {isUploading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {isUploading ? `${uploadProgress}%` : "Upload"}
                  <input type="file" accept="video/*" className="sr-only" onChange={uploadFile} disabled={isUploading || isPreparing} />
                </label>
              </div>
              <div className="max-h-52 overflow-y-auto pr-1 space-y-2">
                {driveFiles.length ? driveFiles.map((file) => {
                  const selected = selectedDriveFile?.id === file.id;
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => { setSelectedDriveFile(file); setTitle((current) => current || file.name); }}
                      className={`w-full flex items-center gap-3 border px-3 py-2.5 text-left transition rounded-lg cursor-pointer ${selected ? "border-primary bg-primary/10" : "border-white/10 bg-white/[0.02] hover:border-white/30"}`}
                    >
                      <PlaySquare className="w-4 h-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{file.name}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">{formatBytes(file.size)}</span>
                      </span>
                      {selected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                }) : <p className="py-5 text-center text-sm text-gray-500">No video files found in this Drive.</p>}
              </div>
              <label className="flex items-start gap-3 border border-white/10 bg-white/[0.02] p-3 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareWithRoom}
                  onChange={(event) => setShareWithRoom(event.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <span className="text-sm text-gray-300">
                  Let people with this room link view the selected Drive file.
                </span>
              </label>
            </>
          )}
        </div>
      )}

      <label className="block">
        <span className="text-sm text-gray-300">Video title <span className="text-gray-500">(optional)</span></span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={source === "youtube" ? "Movie night" : "Use the Drive file name"}
          maxLength={160}
          className="mt-2 w-full h-11 border border-white/10 bg-black/30 px-3 rounded-lg outline-none text-sm focus:border-primary"
        />
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {isPreparing && <p className="text-sm text-amber-200">{prepareStatus || "Preparing a browser-compatible shared video."}</p>}

      <button
        type="submit"
        disabled={submitting || isUploading || isPreparing}
        className="w-full min-h-12 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dull disabled:opacity-60 transition rounded-lg font-medium cursor-pointer disabled:cursor-not-allowed"
      >
        {submitting || isPreparing ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
        {isPreparing ? "Preparing video" : actionLabel}
      </button>
    </form>
  );
};

export default SourceSetup;
