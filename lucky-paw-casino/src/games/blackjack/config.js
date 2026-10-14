// Blackjack table layout and timing (game px, 1280x720). Pure data.
// The background's wood rail sits at y ~240-280; everything below is felt.

export const CARD = { W: 84, H: 120, TEX_SCALE: 2, FAN: 30 };

export const LAYOUT = {
  BOOKER: { x: 640, y: 150, size: 150 },     // Booker deals from behind the rail, centred
  SOBA: { x: 100, y: 610, size: 160 },
  SHOE: { x: 1050, y: 336 },
  DISCARD: { x: 262, y: 336 },     // right of the column Soba's top bubble uses (x < 190)
  DEALER: { x: 640, y: 338 },
  PLAYER: { x: 640, y: 536 },
  SPLIT_X: [470, 830],
  BET: { x: 640, y: 536, r: 62 },
  FELT_TEXT_Y: 420,
  SHOE_INFO: { x: 1050, y: 440 },
  BOOK_INFO: { x: 1050, y: 530 },
  // control strip (y 604..712)
  TRAY: { x: 500, y: 664 },
  BTN_Y: 664,
};

export const TIMING = {
  DEAL_MS: 300,        // card slide from the shoe
  DEAL_GAP: 140,       // pause after each card lands
  FLIP_MS: 130,        // each half of a flip
  DEALER_DRAW: 520,    // pause between dealer draws
  PEEK_MS: 650,
  RESULT_HOLD: 1500,   // results on the table before the cards are cleared
  CLEAR_MS: 320,
};

export const RULE_LINES = [
  'Get closer to 21 than Booker without going over. Face cards are 10, aces 1 or 11.',
  'Blackjack pays 3:2, rounded down to whole chips on odd bets (a 5 bet wins 7).',
  'Place chips on the circle, then Deal (Space). Hit (H), Stand (S), Double (D), Split (P).',
  'Double on any first two cards, also after a split. Split once: any two cards of equal value (K-10 too). Split aces get one card each.',
  'Booker stands on soft 17 and peeks for blackjack with an ace or ten up. 6 decks, reshuffled at 75 %.',
  'Stuck? Ask Soba (?): it knows the basic-strategy book.',
];

export const RULE_PAYOUTS = [
  ['Blackjack', '3:2'],
  ['Win', '1:1'],
  ['Push', 'stake back'],
  ['Insurance / surrender', 'none'],
];
