export const GRADE_LEVEL_OPTIONS = [
  'Elementary School',
  'Middle School',
  'High School',
  'College',
  'Lifelong Learner',
];

// ---------------------------------------------------------------------------
// Materials page (community link/file sharing)
// ---------------------------------------------------------------------------

// Kept comfortably under Firebase's free "Always Free" Cloud Storage tier
// (5 GB stored / 100 GB downloaded per month) even with heavy use, and
// small enough that a batch of expired files never costs much to delete.
export const MATERIAL_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

// Uploaded files are auto-deleted this many days after posting, to keep
// Storage usage low. 75 sits in the middle of the 60–90 day window.
export const MATERIAL_FILE_EXPIRY_DAYS = 75;

export const MATERIAL_DESCRIPTION_MAX_WORDS = 50;

// Passed straight to <input accept="...">. Broad on purpose — "anything a
// student might want to share with other students."
export const MATERIAL_ACCEPTED_FILE_TYPES =
  'image/*,video/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt';