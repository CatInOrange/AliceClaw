export function shouldAutoScrollMessageList({
  previousSessionId,
  nextSessionId,
  previousMessageCount,
  nextMessageCount,
  previousStreamingText,
  nextStreamingText,
}) {
  if (previousSessionId !== nextSessionId) {
    return true;
  }

  if (nextMessageCount > previousMessageCount) {
    return true;
  }

  return nextStreamingText !== previousStreamingText;
}

export function getLunariaScrollbarStyles(options = {}) {
  if (options.hidden) {
    return {
      scrollbarWidth: "none",
      msOverflowStyle: "none",
      "&::-webkit-scrollbar": {
        display: "none",
      },
    };
  }

  return {
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(189, 161, 147, 0.52) transparent",
    "&::-webkit-scrollbar": {
      width: "6px",
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent",
    },
    "&::-webkit-scrollbar-thumb": {
      background: "rgba(189, 161, 147, 0.52)",
      borderRadius: "999px",
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: "rgba(171, 142, 128, 0.72)",
    },
  };
}
