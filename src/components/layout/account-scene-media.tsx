"use client";

import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useRef, useState } from "react";

const photos = [
  "/images/account-gallery/vuni-sarayi.webp",
  "/images/account-gallery/girne-night.webp",
  "/images/account-gallery/buyuk-han.webp",
  "/images/account-gallery/maras-coast.webp",
];

const videos = [
  {
    src: "/videos/account-gallery/othello-kalesi.mp4",
    title: "Othello Kalesi",
  },
  {
    src: "/videos/account-gallery/st-hilarion-kalesi.mp4",
    title: "St. Hilarion Kalesi",
  },
];

export function AccountSceneMedia({
  label,
  videoUnavailable,
}: {
  label: string;
  videoUnavailable: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);

  function selectVideo(index: number) {
    setVideoError(false);

    if (activeVideoIndex === index) {
      const video = videoRef.current;
      if (!video) return;

      if (video.paused) {
        void video.play().catch(() => {
          setVideoError(true);
          setActiveVideoIndex(null);
        });
      } else {
        video.pause();
      }
      return;
    }

    setIsPlaying(true);
    setActiveVideoIndex(index);
  }

  return (
    <section className="editorial-page-scene-media" aria-label={label}>
      <div className="editorial-page-scene-slideshow" aria-hidden="true">
        {photos.map((src, index) => (
          <Image
            key={src}
            className="editorial-page-scene-slide"
            src={src}
            alt=""
            fill
            loading={index === 0 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : undefined}
            unoptimized
          />
        ))}
      </div>
      {activeVideoIndex !== null ? (
        <video
          key={activeVideoIndex}
          ref={videoRef}
          className="editorial-page-scene-video"
          aria-hidden="true"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onCanPlay={(e) => {
            void e.currentTarget.play().catch(() => {});
          }}
          onError={() => {
            setVideoError(true);
            setActiveVideoIndex(null);
          }}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        >
          <source src={videos[activeVideoIndex].src} type="video/mp4" />
        </video>
      ) : null}
      <div className="editorial-page-scene-video-controls" role="group" aria-label={label}>
        {videos.map((video, index) => {
          const isActive = activeVideoIndex === index;
          const Icon = isActive && isPlaying ? Pause : Play;

          return (
            <button
              key={video.src}
              type="button"
              aria-label={video.title}
              aria-pressed={isActive && isPlaying}
              onClick={() => selectVideo(index)}
            >
              <Icon size={13} aria-hidden="true" />
              <span>{video.title}</span>
            </button>
          );
        })}
      </div>
      {videoError ? (
        <p className="editorial-page-scene-video-error" role="status">
          {videoUnavailable}
        </p>
      ) : null}
    </section>
  );
}
