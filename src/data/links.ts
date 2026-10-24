/**
 * Every address this app sends someone to by hand.
 *
 * They live together because two of them are used twice — the feedback form is
 * both a toolbar button and a line in About, the LinkedIn profile is both a
 * credit and a link — and a URL that has drifted between two copies is a dead
 * end for whoever clicks the stale one.
 */

/** Feedback, questions and bug reports. A Google Form, so there is no inbox to run. */
export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSeuN4vp2BvENgGrETL3O9eJ_D6sbZPuoZyUJbxclfBrAiy56w/viewform?usp=publish-editor'

/** The author's profile, linked from About. */
export const AUTHOR_LINKEDIN_URL = 'https://www.linkedin.com/in/abhishek-ranjan-mnnit/'

export const AUTHOR_NAME = 'Abhishek Ranjan'

/** The project's own YouTube channel: tutorials and walkthroughs. */
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/channel/UCr47r4APAx-YyRTd_vfeUXA'

/** The channel with YouTube's "subscribe?" prompt already open. */
export const YOUTUBE_SUBSCRIBE_URL = `${YOUTUBE_CHANNEL_URL}?sub_confirmation=1`

/** The getting-started walkthrough shown on the home screen. */
export const TUTORIAL_VIDEO_ID = '5-hk3NYk-8c'
export const TUTORIAL_VIDEO_URL = `https://youtu.be/${TUTORIAL_VIDEO_ID}`
/** Printed on the card's duration badge, as YouTube does. */
export const TUTORIAL_DURATION = '7:03'
