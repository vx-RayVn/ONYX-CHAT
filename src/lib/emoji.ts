/**
 * Curated emoji set with German + English search keywords.
 * Format per line: <emoji> <shortcode> <keywords…>
 */
import { locale, tk } from '../i18n';
import { flagEmoji } from './flagEmoji';

export type EmojiCategoryId = 'people' | 'nature' | 'food' | 'activity' | 'travel' | 'objects' | 'symbols' | 'flags';

export interface EmojiEntry {
  char: string;
  name: string;
  keywords: string;
  category: EmojiCategoryId;
}

export const EMOJI_CATEGORIES: { id: EmojiCategoryId; label: string }[] = [
  { id: 'people', label: tk('Smileys & People') },
  { id: 'nature', label: tk('Animals & Nature') },
  { id: 'food', label: tk('Food & Drink') },
  { id: 'activity', label: tk('Activities & Gaming') },
  { id: 'travel', label: tk('Travel & Places') },
  { id: 'objects', label: tk('Objects') },
  { id: 'symbols', label: tk('Symbols') },
  { id: 'flags', label: tk('Flags') },
];

const RAW: Record<EmojiCategoryId, string> = {
  people: `
😀 grinning grinsen lachen froh
😃 smiley lächeln freude
😄 smile lachen glücklich
😁 grin grinsen zähne
😆 laughing lachen xd
😅 sweat_smile schwitzen puh
🤣 rofl totlachen boden
😂 joy tränen lachen lol
🙂 slight_smile lächeln
🙃 upside_down kopfüber ironie
😉 wink zwinkern
😊 blush erröten süß
😇 innocent engel unschuldig
🥰 smiling_hearts verliebt herzen
😍 heart_eyes verliebt herzaugen
🤩 star_struck staunen sterne wow
😘 kiss kuss
😋 yum lecker zunge
😛 tongue zunge frech
😜 winking_tongue frech zwinkern
🤪 zany verrückt crazy
😝 squinting_tongue frech
🤑 money_mouth geld reich
🤗 hug umarmen
🤭 hand_over_mouth kichern ups
🤫 shush psst leise
🤔 thinking denken hmm überlegen
🫡 salute salutieren respekt
🤐 zipper_mouth reißverschluss still
🤨 raised_eyebrow skeptisch augenbraue
😐 neutral neutral egal
😑 expressionless ausdruckslos
😶 no_mouth sprachlos
🫠 melting schmelzen
😏 smirk grinsen süffisant
😒 unamused genervt
🙄 eye_roll augenrollen
😬 grimacing grimasse autsch
😮‍💨 exhale ausatmen puh
🤥 lying lügen pinocchio
😌 relieved erleichtert
😔 pensive nachdenklich traurig
😪 sleepy müde
🤤 drool sabbern
😴 sleeping schlafen zzz
😷 mask maske krank
🤒 thermometer krank fieber
🤕 bandage verletzt
🤢 nauseated übel
🤮 vomiting kotzen
🥵 hot heiß schwitzen
🥶 cold kalt frieren
🥴 woozy benommen
😵 dizzy schwindelig
🤯 exploding_head kopf explodiert mindblown
🤠 cowboy cowboy yeehaw
🥳 partying party feiern
😎 sunglasses cool sonnenbrille
🤓 nerd nerd brille
🧐 monocle monokel prüfen
😕 confused verwirrt
😟 worried besorgt
🙁 frowning traurig
😮 open_mouth überrascht oh
😯 hushed erstaunt
😲 astonished erstaunt schock
😳 flushed rot verlegen
🥺 pleading bitte hundeblick
🥹 holding_tears gerührt
😦 frowning_open entsetzt
😨 fearful angst
😰 anxious nervös
😥 sad_relieved traurig
😢 cry weinen traurig
😭 sob heulen weinen
😱 scream schrei horror
😖 confounded gequält
😣 persevering durchhalten
😞 disappointed enttäuscht
😓 downcast_sweat schwitzen
😩 weary erschöpft
😫 tired_face müde fertig
🥱 yawning gähnen langweilig
😤 triumph schnauben stolz
😡 rage wütend sauer
😠 angry ärgerlich
🤬 cursing fluchen
😈 smiling_imp teufel frech
👿 imp teufel böse
💀 skull totenkopf dead lol
☠️ skull_crossbones gift
💩 poop kacke
🤡 clown clown
👹 ogre oni monster
👻 ghost geist gespenst
👽 alien alien außerirdisch
👾 space_invader alien game retro
🤖 robot roboter bot
😺 smiley_cat katze
😹 joy_cat katze lachen
😻 heart_eyes_cat katze verliebt
🙈 see_no_evil affe nicht sehen
🙉 hear_no_evil affe nicht hören
🙊 speak_no_evil affe nicht sagen
👋 wave winken hallo tschüss
🤚 raised_back_hand hand
✋ raised_hand hand stopp
🖖 vulcan vulkanier
👌 ok_hand ok perfekt
🤌 pinched_fingers italienisch
✌️ v sieg peace
🤞 crossed_fingers daumen drücken glück
🫶 heart_hands herzhände liebe
🤟 love_you liebe dich
🤘 metal rock metal
🤙 call_me ruf an shaka
👈 point_left links
👉 point_right rechts
👆 point_up oben
👇 point_down unten
☝️ index_up eins wichtig
👍 thumbsup daumen hoch gut ja
👎 thumbsdown daumen runter schlecht nein
✊ fist faust
👊 punch faustschlag
🤛 left_fist faust
🤜 right_fist faust
👏 clap klatschen applaus
🙌 raised_hands hurra feiern
👐 open_hands offene hände
🤲 palms_up bitte
🤝 handshake handschlag deal
🙏 pray bitte danke beten
✍️ writing schreiben
💅 nail_care nagellack
💪 muscle muskeln stark
🧠 brain gehirn schlau
👀 eyes augen gucken
👁️ eye auge
👅 tongue_out zunge
👄 lips lippen
🫦 biting_lip lippe
👶 baby baby
🧑 person person
👨‍💻 technologist programmierer coder
🧑‍🚀 astronaut astronaut
🥷 ninja ninja
🦸 superhero held
🧙 mage zauberer
🧛 vampire vampir
🧟 zombie zombie
💃 dancer tanzen
🕺 man_dancing tanzen
🫂 people_hugging umarmung
`,
  nature: `
🐶 dog hund
🐱 cat katze
🐭 mouse maus
🐹 hamster hamster
🐰 rabbit hase
🦊 fox fuchs
🐻 bear bär
🐼 panda panda
🐨 koala koala
🐯 tiger tiger
🦁 lion löwe
🐮 cow kuh
🐷 pig schwein
🐸 frog frosch
🐵 monkey affe
🐔 chicken huhn
🐧 penguin pinguin
🐦 bird vogel
🦅 eagle adler
🦉 owl eule
🦇 bat fledermaus
🐺 wolf wolf
🐗 boar wildschwein
🐴 horse pferd
🦄 unicorn einhorn
🐝 bee biene
🐛 bug käfer
🦋 butterfly schmetterling
🐌 snail schnecke
🐞 ladybug marienkäfer
🐢 turtle schildkröte
🐍 snake schlange
🦎 lizard eidechse
🐙 octopus krake
🦑 squid tintenfisch
🦈 shark hai
🐬 dolphin delfin
🐳 whale wal
🐊 crocodile krokodil
🦖 trex dino dinosaurier
🐉 dragon drache
🌵 cactus kaktus
🎄 christmas_tree weihnachtsbaum
🌲 evergreen tanne baum
🌴 palm palme
🌱 seedling keim pflanze
🌿 herb kraut
🍀 four_leaf_clover kleeblatt glück
🍁 maple_leaf ahorn blatt herbst
🍂 fallen_leaf herbst laub
🍄 mushroom pilz
🌸 cherry_blossom kirschblüte
🌹 rose rose
🌻 sunflower sonnenblume
🌙 crescent_moon mond nacht
⭐ star stern
🌟 glowing_star stern glänzen
✨ sparkles funkeln glitzer
⚡ zap blitz energie
🔥 fire feuer heiß lit
🌈 rainbow regenbogen
☀️ sun sonne
⛅ partly_sunny wolke sonne
🌧️ rain regen
❄️ snowflake schnee kalt
☃️ snowman schneemann
🌊 wave_water welle meer
💧 droplet tropfen
🌍 earth erde welt
🪐 planet planet
☄️ comet komet
`,
  food: `
🍏 green_apple apfel grün
🍎 apple apfel
🍊 orange orange
🍋 lemon zitrone
🍌 banana banane
🍉 watermelon wassermelone
🍇 grapes trauben
🍓 strawberry erdbeere
🍒 cherries kirschen
🍑 peach pfirsich
🥭 mango mango
🍍 pineapple ananas
🥥 coconut kokosnuss
🥑 avocado avocado
🌶️ hot_pepper chili scharf
🥕 carrot karotte
🌽 corn mais
🥐 croissant croissant
🥨 pretzel brezel
🧀 cheese käse
🥚 egg ei
🥓 bacon speck
🍗 poultry_leg hähnchen
🍖 meat fleisch
🌭 hotdog hotdog
🍔 burger burger
🍟 fries pommes
🍕 pizza pizza
🥪 sandwich sandwich
🌮 taco taco
🌯 burrito burrito
🥗 salad salat
🍝 spaghetti spaghetti nudeln
🍜 ramen ramen nudelsuppe
🍣 sushi sushi
🍱 bento bento
🥟 dumpling teigtasche
🍦 ice_cream eis
🍩 donut donut
🍪 cookie keks
🎂 birthday_cake torte geburtstag
🍰 cake kuchen
🧁 cupcake cupcake
🍫 chocolate schokolade
🍬 candy bonbon
🍿 popcorn popcorn kino
☕ coffee kaffee
🍵 tea tee
🧋 bubble_tea bubbletea
🥤 cup_straw becher softdrink
🧃 juice saft
🍺 beer bier
🍻 beers prost bier
🥂 champagne sekt anstoßen
🍷 wine wein
🥃 whisky whisky
🧊 ice eis würfel
`,
  activity: `
🎮 video_game zocken controller gaming game
🕹️ joystick joystick arcade retro
👾 alien_monster pixel game retro
🎯 dart ziel treffer
🏆 trophy pokal sieg gewinn
🥇 first_place gold erster platz
🥈 second_place silber zweiter
🥉 third_place bronze dritter
🏅 medal medaille
🎖️ military_medal orden
🎲 game_die würfel
♟️ chess_pawn schach
🧩 puzzle puzzle
🎰 slot_machine automat
🎳 bowling bowling
⚽ soccer fußball
🏀 basketball basketball
🏈 football football
⚾ baseball baseball
🎾 tennis tennis
🏐 volleyball volleyball
🏓 ping_pong tischtennis
🥊 boxing_glove boxen
🥋 martial_arts kampfsport
⛳ golf golf
🏹 bow_and_arrow bogen pfeil
🎣 fishing angeln
🛹 skateboard skateboard
🏂 snowboarder snowboard
🏋️ weight_lifting gewichtheben
🚴 biking fahrrad
🏁 checkered_flag ziel rennen
🎪 circus zirkus
🎨 art kunst malen
🎬 clapper film klappe
🎤 microphone mikrofon singen
🎧 headphones kopfhörer musik
🎼 score noten
🎹 piano klavier
🥁 drum schlagzeug
🎸 guitar gitarre
🎻 violin geige
🎉 tada party feier konfetti
🎊 confetti_ball konfetti
🎈 balloon ballon
🎁 gift geschenk
🎫 ticket ticket
🎟️ admission_tickets eintrittskarte
🃏 joker joker karte
🀄 mahjong mahjong
`,
  travel: `
🚗 car auto
🚕 taxi taxi
🏎️ race_car rennwagen schnell
🚓 police_car polizei
🚑 ambulance krankenwagen
🚒 fire_engine feuerwehr
🚌 bus bus
🚂 train zug
🚀 rocket rakete start
🛸 ufo ufo
🚁 helicopter hubschrauber
✈️ airplane flugzeug
🛳️ ship schiff
⛵ sailboat segelboot
🗺️ map karte
🧭 compass kompass
🏔️ mountain_snow berg
🌋 volcano vulkan
🏕️ camping camping zelt
🏖️ beach strand urlaub
🏝️ island insel
🏠 house haus
🏰 castle burg schloss
🗼 tokyo_tower turm
🌃 night_city stadt nacht
🌆 cityscape stadt abend
🌉 bridge brücke
🎡 ferris_wheel riesenrad
🎢 roller_coaster achterbahn
🌌 milky_way milchstraße galaxie
🌅 sunrise sonnenaufgang
`,
  objects: `
💻 laptop laptop computer
🖥️ desktop pc monitor
⌨️ keyboard tastatur
🖱️ mouse_computer maus
📱 phone handy smartphone
☎️ telephone telefon
📷 camera kamera
🎥 movie_camera filmkamera
📺 tv fernseher
📡 satellite satellit
🔋 battery akku batterie
🔌 plug stecker
💡 bulb idee glühbirne
🔦 flashlight taschenlampe
🕯️ candle kerze
💸 money_wings geld weg
💵 dollar geld schein
💰 moneybag geldsack
💳 credit_card karte
💎 gem edelstein diamant juwel
⚖️ scales waage
🔧 wrench schraubenschlüssel
🔨 hammer hammer
⚙️ gear zahnrad einstellungen
🧲 magnet magnet
🔫 water_pistol wasserpistole
💣 bomb bombe
🗡️ dagger dolch
⚔️ swords schwerter kampf
🛡️ shield schild
🔮 crystal_ball kristallkugel
🧿 nazar amulett
💊 pill pille
🧪 test_tube reagenzglas experiment
🔭 telescope teleskop
🔬 microscope mikroskop
🧸 teddy teddy
🪄 magic_wand zauberstab
📦 package paket
✉️ envelope brief
📩 envelope_arrow nachricht
📝 memo notiz
📌 pushpin pin anheften
📎 paperclip büroklammer
✂️ scissors schere
🗑️ wastebasket mülleimer
🔒 lock schloss
🔓 unlock offen
🔑 key schlüssel
🗝️ old_key alter schlüssel
⏰ alarm wecker
⌛ hourglass sanduhr
⏱️ stopwatch stoppuhr
📅 calendar kalender
📈 chart_up chart steigend
📉 chart_down chart fallend
📊 bar_chart diagramm
🔔 bell glocke benachrichtigung
🔕 no_bell stumm
📣 megaphone megafon ankündigung
📢 loudspeaker lautsprecher
🎙️ studio_mic mikrofon podcast
`,
  symbols: `
❤️ heart herz liebe rot
🧡 orange_heart herz orange
💛 yellow_heart herz gelb
💚 green_heart herz grün
💙 blue_heart herz blau
💜 purple_heart herz lila
🖤 black_heart herz schwarz
🤍 white_heart herz weiß
🤎 brown_heart herz braun
💔 broken_heart gebrochenes herz
❤️‍🔥 heart_fire herz feuer
💕 two_hearts herzen
💞 revolving_hearts herzen
💗 heartpulse herz wachsend
💖 sparkling_heart herz glitzer
💘 cupid amor
💯 100 hundert perfekt
💢 anger wut
💥 boom knall explosion
💫 dizzy_star sterne
💦 sweat_drops tropfen
💨 dash weg schnell
💬 speech_bubble sprechblase chat
💭 thought_bubble gedanke
💤 zzz schlafen
✅ white_check_mark erledigt haken ja
☑️ ballot_check haken
✔️ check haken
❌ x kreuz nein falsch
❎ negative_x kreuz
⭕ o kreis
🚫 no_entry verboten
⛔ no_entry_sign stopp
⚠️ warning warnung achtung
❗ exclamation ausrufezeichen
❓ question fragezeichen
‼️ bangbang doppelt
⁉️ interrobang frage
➕ plus plus
➖ minus minus
➗ divide geteilt
🔝 top top
🆕 new neu
🆒 cool cool
🆗 ok ok
🆙 up up
🆓 free gratis kostenlos
🔴 red_circle rot kreis live
🟠 orange_circle orange kreis
🟡 yellow_circle gelb kreis
🟢 green_circle grün kreis
🔵 blue_circle blau kreis
🟣 purple_circle lila kreis
⚫ black_circle schwarz kreis
⚪ white_circle weiß kreis
🔺 red_triangle dreieck
🔻 down_triangle dreieck
♻️ recycle recycling
🔁 repeat wiederholen
▶️ play abspielen
⏸️ pause pause
⏹️ stop stopp
⏭️ next weiter
🔊 loud laut
🔇 mute stumm
🎵 note musik
🎶 notes musik
➡️ arrow_right pfeil rechts
⬅️ arrow_left pfeil links
⬆️ arrow_up pfeil hoch
⬇️ arrow_down pfeil runter
🔄 arrows_counter neu laden
`,
  flags: `
🏳️ white_flag weiße flagge aufgeben
🏴 black_flag schwarze flagge
🏁 finish_flag ziel
🚩 red_flag rote flagge
🏳️‍🌈 rainbow_flag regenbogen pride
`,
};

/** Regions with a flag emoji (ISO 3166-1 plus EU and UN). */
const FLAG_REGIONS =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET EU FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UN US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW';

/** Country flags with the region name in English, German and the app language as keywords. */
function flagEntries(): EmojiEntry[] {
  const langs = [...new Set(['en', 'de', locale()])];
  const namers = langs.flatMap((l) => {
    try {
      return [new Intl.DisplayNames([l], { type: 'region' })];
    } catch {
      return [];
    }
  });
  const regions = FLAG_REGIONS.split(' ').map((code) => {
    const names = namers.map((n) => n.of(code) ?? '').filter((n) => n && n !== code);
    return { code, char: flagEmoji(code), names, sort: names[0] ?? code };
  });
  // England, Scotland and Wales use tag sequences (🏴 + gbeng + cancel tag).
  const tagged = [
    ['gbeng', 'England'],
    ['gbsct', 'Scotland'],
    ['gbwls', 'Wales'],
  ].map(([tag, name]) => ({
    code: tag,
    char: String.fromCodePoint(0x1f3f4, ...[...tag].map((c) => 0xe0000 + c.charCodeAt(0)), 0xe007f),
    names: [name],
    sort: name,
  }));
  return [...regions, ...tagged]
    .sort((a, b) => a.sort.localeCompare(b.sort, 'en'))
    .map(({ code, char, names }) => ({
      char,
      name: `flag_${code.toLowerCase()}`,
      keywords: `flag ${code.toLowerCase()} ${names.join(' ')}`.toLowerCase(),
      category: 'flags' as const,
    }));
}

function parse(): EmojiEntry[] {
  const out: EmojiEntry[] = [];
  const seen = new Set<string>();
  (Object.keys(RAW) as EmojiCategoryId[]).forEach((category) => {
    RAW[category]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [char, name, ...kw] = line.split(/\s+/);
        if (seen.has(char)) return;
        seen.add(char);
        out.push({ char, name, keywords: `${name.replace(/_/g, ' ')} ${kw.join(' ')}`.toLowerCase(), category });
      });
  });
  for (const e of flagEntries()) if (!seen.has(e.char)) out.push(e);
  return out;
}

export const EMOJIS: EmojiEntry[] = parse();

export const EMOJI_BY_NAME = new Map(EMOJIS.map((e) => [e.name, e.char]));
export const EMOJI_BY_CHAR = new Map(EMOJIS.map((e) => [e.char, e]));

export const DEFAULT_FREQUENT = ['👍', '🔥', '😂', '❤️', '💯', '🎮', '👀', '🫡', '😭', '🎉', '💀', '✅'];
export const QUICK_REACTIONS = ['👍', '🔥', '😂'];

export function searchEmojis(query: string, limit = 60): EmojiEntry[] {
  const q = query.trim().toLowerCase().replace(/^:/, '');
  if (!q) return [];
  const starts: EmojiEntry[] = [];
  const contains: EmojiEntry[] = [];
  for (const e of EMOJIS) {
    if (e.name.startsWith(q)) starts.push(e);
    else if (e.keywords.includes(q)) contains.push(e);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Matches strings that consist only of emoji (and whitespace) → jumbo rendering. */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier}|[󠀠-󠁿])*|\p{Regional_Indicator}{2}|<a?:\w+:[\w-]+>|\s)+$/u;
export function isEmojiOnly(text: string) {
  const t = text.trim();
  if (!t || t.length > 80) return false;
  return EMOJI_ONLY.test(t) && !/^\d+$/.test(t);
}

/** Replace :shortcode: with unicode emoji when known. */
export function replaceShortcodes(text: string) {
  return text.replace(/:([a-z0-9_+-]{2,32}):/gi, (m, name: string) => EMOJI_BY_NAME.get(name.toLowerCase()) ?? m);
}
