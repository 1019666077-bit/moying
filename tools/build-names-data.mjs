#!/usr/bin/env node
/**
 * Build the rich per-name data file (data/names-zh.json) from the existing
 * zh/pinyin table plus hand-written content (gender, origin, meaning, note) for
 * every name. New names carry their zh/pinyin here; existing names keep the
 * transliterations already in the file. Also writes a per-character meaning map
 * used to render "character by character" sections on each name page.
 *
 *   node tools/build-names-data.mjs
 *
 * Re-running is idempotent: existing zh/pinyin are never rewritten, and the
 * output is sorted so diffs stay readable. The script fails loudly if a name is
 * missing content or a Chinese character has no meaning entry.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "data", "names-zh.json");

// gender: m (masculine), f (feminine), u (unisex). origin is a short label used
// both for display and for "similar origin" links. note is a short, conservative
// sentence (origin context, a famous bearer, or a cultural note). Famous people
// are limited to well-documented figures.
const CONTENT = {
  Aaron: { gender: "m", origin: "Hebrew", meaning: "exalted, high mountain", note: "In the Bible, Aaron was the brother of Moses and the first high priest of Israel." },
  Abigail: { gender: "f", origin: "Hebrew", meaning: "my father's joy", note: "In the Bible, Abigail was a wise and beautiful wife of King David." },
  Adam: { gender: "m", origin: "Hebrew", meaning: "man, earth", note: "In the Bible, Adam is the first man in the Book of Genesis." },
  Addison: { gender: "f", origin: "English", meaning: "son of Adam", zh: "艾迪生", pinyin: "Ài dí shēng", note: "A surname meaning 'son of Adam' that became a top girls' pick in the 2000s." },
  Adeline: { gender: "f", origin: "French", meaning: "noble", zh: "阿德琳", pinyin: "Ā dé lín", note: "A French name meaning 'noble' that has been revived in the 21st century." },
  Adrian: { gender: "m", origin: "Latin", meaning: "from Hadria (a town in northern Italy)", zh: "阿德里安", pinyin: "Ā dé lǐ ān", note: "The name of a Roman emperor and of several early popes." },
  Aiden: { gender: "m", origin: "Irish", meaning: "little fire", note: "A modern favourite with Irish roots, often chosen for its bright, energetic sound." },
  Alan: { gender: "m", origin: "Celtic", meaning: "handsome, cheerful (of uncertain origin)", note: "A classic Gaelic name that has stayed common across the English-speaking world for generations." },
  Albert: { gender: "m", origin: "Germanic", meaning: "noble and bright", note: "Albert Einstein, the physicist who developed the theory of relativity, carried this name." },
  Alexander: { gender: "m", origin: "Greek", meaning: "defender of the people", note: "Alexander the Great, the ancient Macedonian king, is the name's most famous bearer." },
  Alexandra: { gender: "f", origin: "Greek", meaning: "defender of the people", zh: "亚历山德拉", pinyin: "Yà lì shān dé lā", note: "The feminine of Alexander, carried by the last tsarina of Russia." },
  Alice: { gender: "f", origin: "Germanic", meaning: "noble", note: "Lewis Carroll's Alice's Adventures in Wonderland made the name a literary icon." },
  Amanda: { gender: "f", origin: "Latin", meaning: "worthy of love", note: "A Latin name meaning 'worthy of love' that peaked in the 1980s." },
  Amelia: { gender: "f", origin: "Germanic", meaning: "industrious, striving", note: "A name with aviation history through the pilot Amelia Earhart." },
  Amy: { gender: "f", origin: "French", meaning: "beloved", note: "A friendly French name meaning 'beloved', a favourite of the 1970s." },
  Andrea: { gender: "f", origin: "Greek", meaning: "strong, brave (feminine of Andrew)", note: "The feminine of Andrew, common across many European languages." },
  Andrew: { gender: "m", origin: "Greek", meaning: "manly, brave", note: "Saint Andrew is the patron saint of Scotland and one of the twelve apostles." },
  Angela: { gender: "f", origin: "Greek", meaning: "messenger, angel", note: "From the Greek for 'messenger', and the name of the civil-rights activist Angela Davis." },
  Anna: { gender: "f", origin: "Hebrew", meaning: "grace", note: "A timeless name carried by heroines of literature and by many saints." },
  Anthony: { gender: "m", origin: "Latin", meaning: "priceless one (from the Roman name Antonius)", note: "Saint Anthony of Padua made the name beloved in the Christian world." },
  Antonio: { gender: "m", origin: "Spanish", meaning: "priceless one (form of Anthony)", note: "A Spanish and Italian form of Anthony, common across southern Europe and Latin America." },
  Aria: { gender: "f", origin: "Italian", meaning: "air, a solo song", note: "A musical term for a solo song, now a top US girls' name." },
  Ariana: { gender: "f", origin: "Greek", meaning: "most holy (from Ariadne)", zh: "阿里安娜", pinyin: "Ā lǐ ān nà", note: "From the Greek Ariadne, and the name of the singer Ariana Grande." },
  Arthur: { gender: "m", origin: "Celtic", meaning: "bear (of uncertain origin)", note: "King Arthur, the legendary British ruler of the Round Table, gave the name its heroic tone." },
  Asher: { gender: "m", origin: "Hebrew", meaning: "happy, blessed", zh: "阿舍", pinyin: "Ā shě", note: "In the Bible, Asher was one of Jacob's twelve sons." },
  Ashley: { gender: "f", origin: "English", meaning: "ash tree meadow", note: "An English surname that swept to the top of US charts in the 1980s and 1990s." },
  Athena: { gender: "f", origin: "Greek", meaning: "goddess of wisdom and war", zh: "雅典娜", pinyin: "Yǎ diǎn nà", note: "Athena was the Greek goddess of wisdom, war and crafts." },
  Audrey: { gender: "f", origin: "English", meaning: "noble strength", note: "The actress Audrey Hepburn gave the name its elegant charm." },
  Aurora: { gender: "f", origin: "Latin", meaning: "dawn", note: "The Roman goddess of dawn, and the sleeping princess in the fairy tale." },
  Austin: { gender: "m", origin: "Latin", meaning: "great, magnificent (from Augustine)", note: "A sleek place-and-surname name that rose sharply in the late 20th century." },
  Autumn: { gender: "f", origin: "English", meaning: "the fall season", zh: "奥特姆", pinyin: "Ào tè mǔ", note: "A season name for the fall, popular since the 1970s." },
  Ava: { gender: "f", origin: "Germanic", meaning: "bird, life (of uncertain origin)", zh: "艾娃", pinyin: "Ài wá", note: "The actress Ava Gardner gave the name its mid-century glamour." },
  Avery: { gender: "u", origin: "English", meaning: "elf ruler", note: "A surname name that now sits high on the charts for any gender." },
  Barbara: { gender: "f", origin: "Greek", meaning: "foreign, stranger", note: "Saint Barbara is the patron saint of miners and architects." },
  Bella: { gender: "f", origin: "Italian", meaning: "beautiful", note: "An Italian word for 'beautiful', popularised by the Twilight heroine." },
  Benjamin: { gender: "m", origin: "Hebrew", meaning: "son of the right hand", note: "In the Bible, Benjamin was the youngest son of Jacob and Rachel." },
  Blake: { gender: "u", origin: "English", meaning: "dark-haired or pale (of uncertain origin)", note: "A crisp surname name that works for any gender and evokes the poet William Blake." },
  Bradley: { gender: "m", origin: "English", meaning: "broad meadow", note: "A gentle English surname name meaning 'broad meadow'." },
  Brandon: { gender: "m", origin: "English", meaning: "broom hill, or prince (from Brandon)", note: "A surname-turned-first-name that was a top pick in the 1980s and 1990s." },
  Brenda: { gender: "f", origin: "Norse", meaning: "sword (of uncertain origin)", note: "A Norse-rooted name that was a mid-century favourite." },
  Brian: { gender: "m", origin: "Irish", meaning: "high, noble", note: "Brian Boru was a celebrated High King of Ireland in the early 11th century." },
  Brooklyn: { gender: "f", origin: "Dutch", meaning: "broken land (a New York borough)", zh: "布鲁克林", pinyin: "Bù lǔ kè lín", note: "A place name from the New York borough, popular since the 1990s." },
  Bruce: { gender: "m", origin: "Scottish", meaning: "from the brushwood", note: "The name of the Scottish hero Robert the Bruce, and later of the musician Bruce Springsteen." },
  Caleb: { gender: "m", origin: "Hebrew", meaning: "whole-hearted, faithful", note: "In the Bible, Caleb was one of the two spies who trusted God to give Israel the land." },
  Cameron: { gender: "u", origin: "Scottish", meaning: "crooked nose", note: "A Scottish clan surname that became a popular first name for any gender." },
  Camila: { gender: "f", origin: "Latin", meaning: "young ceremonial attendant", note: "A Spanish and Italian name that has surged in popularity in recent years." },
  Carl: { gender: "m", origin: "Germanic", meaning: "free man (form of Charles)", note: "A solid Germanic name shared by the astronomer Carl Sagan." },
  Carlos: { gender: "m", origin: "Spanish", meaning: "free man (form of Charles)", note: "The Spanish and Portuguese form of Charles, common throughout the Spanish-speaking world." },
  Carol: { gender: "f", origin: "Germanic", meaning: "free man (feminine of Charles)", note: "A feminine of Charles, and the name of many beloved Christmas songs." },
  Caroline: { gender: "f", origin: "French", meaning: "free man (feminine of Charles)", zh: "卡罗琳", pinyin: "Kǎ luó lín", note: "A French feminine of Charles, and the title of a Neil Diamond song." },
  Carolyn: { gender: "f", origin: "Germanic", meaning: "free man (feminine of Charles)", note: "A classic feminine of Charles that peaked in the mid-20th century." },
  Carter: { gender: "m", origin: "English", meaning: "cart driver", note: "An English occupational surname that entered the top ranks in the early 2000s." },
  Charles: { gender: "m", origin: "Germanic", meaning: "free man", note: "Carried by King Charles I, Charles Darwin and Charles Dickens." },
  Charlotte: { gender: "f", origin: "French", meaning: "free man (feminine of Charles)", zh: "夏洛特", pinyin: "Xià luò tè", note: "The name of Queen Charlotte of England and of the writer Charlotte Brontë." },
  Chase: { gender: "m", origin: "English", meaning: "hunter", zh: "蔡斯", pinyin: "Cài sī", note: "An English word-name for a hunter, now a modern favourite." },
  Cheryl: { gender: "f", origin: "French", meaning: "dear one (from chérie)", note: "A French-rooted name meaning 'dear', a big favourite of the 1950s." },
  Chloe: { gender: "f", origin: "Greek", meaning: "young green shoot, blooming", note: "A Greek name tied to the goddess of agriculture, from the word for 'green shoot'." },
  Christian: { gender: "m", origin: "Latin", meaning: "follower of Christ", note: "A name that literally means a follower of Christ, popular across many languages." },
  Christina: { gender: "f", origin: "Greek", meaning: "follower of Christ", note: "A form of Christine, tied to the word 'Christ'." },
  Christine: { gender: "f", origin: "Greek", meaning: "follower of Christ", note: "A French form of Christina, common across the Christian world." },
  Christopher: { gender: "m", origin: "Greek", meaning: "bearer of Christ", note: "Saint Christopher is the legendary patron of travellers." },
  Claire: { gender: "f", origin: "French", meaning: "clear, bright", note: "A bright French name meaning 'clear', shared by the actress Claire Danes." },
  Clara: { gender: "f", origin: "Latin", meaning: "clear, bright", zh: "克拉拉", pinyin: "Kè lā lā", note: "The name of Clara Barton, founder of the American Red Cross." },
  Cody: { gender: "m", origin: "Irish", meaning: "helpful (from a surname)", note: "An Irish surname made famous by the showman Buffalo Bill Cody." },
  Cole: { gender: "m", origin: "English", meaning: "coal-black, swarthy", note: "A short, modern surname name with an old English meaning of 'coal-black'." },
  Colin: { gender: "m", origin: "Scottish", meaning: "young creature, or people's victory", note: "A Scottish-Irish classic shared by the actor Colin Firth." },
  Connor: { gender: "m", origin: "Irish", meaning: "lover of hounds", note: "An Irish name meaning 'lover of hounds', carried by many a king of Connacht." },
  Cooper: { gender: "m", origin: "English", meaning: "barrel maker", zh: "库珀", pinyin: "Kù pò", note: "An English surname for a barrel maker that became a popular first name." },
  Cynthia: { gender: "f", origin: "Greek", meaning: "from Mount Cynthus (an epithet of Artemis)", note: "An epithet of Artemis, the Greek moon goddess of Mount Cynthus." },
  Daisy: { gender: "f", origin: "English", meaning: "day's eye (a flower)", note: "A flower name from 'day's eye', and the heroine of The Great Gatsby." },
  Daniel: { gender: "m", origin: "Hebrew", meaning: "God is my judge", note: "In the Bible, Daniel survived the lions' den and interpreted dreams." },
  David: { gender: "m", origin: "Hebrew", meaning: "beloved", note: "King David, the shepherd who defeated Goliath, is the name's most famous bearer." },
  Dean: { gender: "m", origin: "English", meaning: "valley, or church official", note: "A cool one-syllable choice popularised by the actor James Dean." },
  Deborah: { gender: "f", origin: "Hebrew", meaning: "bee", note: "In the Bible, Deborah was a prophetess and judge of Israel." },
  Debra: { gender: "f", origin: "Hebrew", meaning: "bee (variant of Deborah)", note: "A spelling variant of Deborah that was hugely popular in the 1950s." },
  Declan: { gender: "m", origin: "Irish", meaning: "man of prayer, full of goodness", zh: "德克兰", pinyin: "Dé kè lán", note: "Saint Declan was a fifth-century Irish missionary." },
  Delilah: { gender: "f", origin: "Hebrew", meaning: "delicate", zh: "黛利拉", pinyin: "Dài lì lā", note: "In the Bible, Delilah was the woman who betrayed Samson." },
  Dennis: { gender: "m", origin: "Greek", meaning: "follower of Dionysus", note: "From the Greek god Dionysus; a steady classic of the mid-20th century." },
  Derek: { gender: "m", origin: "Germanic", meaning: "ruler of the people", note: "A Germanic name meaning 'ruler of the people', shortened from Theodoric." },
  Diane: { gender: "f", origin: "Latin", meaning: "divine (form of Diana)", note: "A French form of Diana, the Roman goddess of the hunt." },
  Diego: { gender: "m", origin: "Spanish", meaning: "supplanter (form of James)", note: "The Spanish form of James, made famous by the artist Diego Velázquez." },
  Dominic: { gender: "m", origin: "Latin", meaning: "of the Lord", note: "Saint Dominic founded the Dominican order in the 13th century." },
  Donald: { gender: "m", origin: "Scottish", meaning: "world ruler", note: "A Gaelic name meaning 'world ruler', long associated with Scottish clans." },
  Donna: { gender: "f", origin: "Italian", meaning: "lady", note: "An Italian word for 'lady', a top pick of the 1960s." },
  Dorothy: { gender: "f", origin: "Greek", meaning: "gift of God", note: "The heroine of The Wizard of Oz, who travelled down the yellow brick road." },
  Dylan: { gender: "m", origin: "Welsh", meaning: "son of the sea", zh: "迪伦", pinyin: "Dí lún", note: "The Welsh poet Dylan Thomas, and the singer Bob Dylan, carried the name." },
  Edward: { gender: "m", origin: "English", meaning: "wealthy guard", note: "Carried by eight English kings, including Edward the Confessor." },
  Eleanor: { gender: "f", origin: "French", meaning: "bright, shining one", zh: "埃莉诺", pinyin: "Āi lì nuò", note: "Eleanor Roosevelt, the influential US first lady and diplomat, bore this name." },
  Elena: { gender: "f", origin: "Greek", meaning: "bright, shining light (form of Helen)", zh: "埃琳娜", pinyin: "Āi lín nà", note: "A southern-European form of Helen, meaning 'bright, shining light'." },
  Eli: { gender: "m", origin: "Hebrew", meaning: "ascended, uplifted", zh: "伊莱", pinyin: "Yī lái", note: "In the Bible, Eli was the high priest who raised the prophet Samuel." },
  Elias: { gender: "m", origin: "Greek", meaning: "my God is Yahweh (form of Elijah)", zh: "埃利亚斯", pinyin: "Āi lì yà sī", note: "The Greek form of Elijah, carried by several early saints." },
  Elijah: { gender: "m", origin: "Hebrew", meaning: "my God is Yahweh", note: "The biblical prophet Elijah called down fire from heaven on Mount Carmel." },
  Elizabeth: { gender: "f", origin: "Hebrew", meaning: "pledged to God", note: "The name of two English queens, including the long-reigning Elizabeth II." },
  Ella: { gender: "f", origin: "Germanic", meaning: "all, completely", note: "A graceful short name shared by the jazz singer Ella Fitzgerald." },
  Elliot: { gender: "m", origin: "Hebrew", meaning: "the Lord is my God", zh: "埃利奥特", pinyin: "Āi lì ào tè", note: "A surname-turned-first-name shared by the poet T. S. Eliot." },
  Emily: { gender: "f", origin: "Latin", meaning: "rival, eager", note: "A Latin-rooted classic shared by the poet Emily Dickinson." },
  Emma: { gender: "f", origin: "Germanic", meaning: "whole, universal", note: "Jane Austen's novel Emma (1815) made the name a literary favourite." },
  Emmett: { gender: "m", origin: "Germanic", meaning: "whole, universal", zh: "埃米特", pinyin: "Āi mǐ tè", note: "A Germanic name meaning 'universal', now a top US pick." },
  Eric: { gender: "m", origin: "Norse", meaning: "eternal ruler", note: "A Norse name meaning 'eternal ruler', common across Scandinavia." },
  Ethan: { gender: "m", origin: "Hebrew", meaning: "firm, enduring", note: "A solid Hebrew name that topped the US charts for most of the 2010s." },
  Eugene: { gender: "m", origin: "Greek", meaning: "well-born, noble", note: "A Greek name meaning 'well-born', shared by the playwright Eugene O'Neill." },
  Evelyn: { gender: "f", origin: "Germanic", meaning: "wished-for child (of uncertain origin)", note: "A surname-turned-first-name that has returned to the top of the charts." },
  Everett: { gender: "m", origin: "English", meaning: "brave as a boar", zh: "埃弗里特", pinyin: "Āi fú lǐ tè", note: "An English surname name that has risen steadily since the 2000s." },
  Everly: { gender: "f", origin: "English", meaning: "boar meadow", zh: "埃弗利", pinyin: "Āi fú lì", note: "A modern English surname name, made famous by the Everly Brothers." },
  Ezra: { gender: "m", origin: "Hebrew", meaning: "help", zh: "埃兹拉", pinyin: "Āi zī lā", note: "In the Bible, Ezra the scribe led the Jews back from exile." },
  Felix: { gender: "m", origin: "Latin", meaning: "happy, fortunate", note: "A cheerful Latin name meaning 'happy', and a favourite in ancient Rome." },
  Frances: { gender: "f", origin: "Latin", meaning: "from France, free one", note: "A feminine of Francis, and the name of the writer Frances Hodgson Burnett." },
  Frank: { gender: "m", origin: "Germanic", meaning: "free man (short form of Francis)", note: "A friendly short form of Francis, and the name of the singer Frank Sinatra." },
  Freya: { gender: "f", origin: "Norse", meaning: "lady, goddess of love", zh: "弗雷娅", pinyin: "Fú léi yà", note: "Freya was the Norse goddess of love, beauty and war." },
  Gabriel: { gender: "m", origin: "Hebrew", meaning: "God is my strength", zh: "加布里埃尔", pinyin: "Jiā bù lǐ āi ěr", note: "The archangel Gabriel announced the births of John the Baptist and Jesus." },
  Gabriella: { gender: "f", origin: "Hebrew", meaning: "God is my strength (feminine of Gabriel)", zh: "加布里埃拉", pinyin: "Jiā bù lǐ āi lā", note: "The feminine of Gabriel, popular across Italy and Latin America." },
  Gary: { gender: "m", origin: "Germanic", meaning: "spear (from a surname)", note: "A mid-century classic made famous by the actor Gary Cooper." },
  Gavin: { gender: "m", origin: "Welsh", meaning: "white hawk", zh: "加文", pinyin: "Jiā wén", note: "A Welsh name meaning 'white hawk', common in Scotland and Wales." },
  Genevieve: { gender: "f", origin: "French", meaning: "woman of the family", zh: "吉纳维芙", pinyin: "Jí nà wéi fú", note: "Saint Genevieve is the patron saint of Paris." },
  George: { gender: "m", origin: "Greek", meaning: "farmer, earth-worker", note: "The name of six British kings and of George Washington, the first US president." },
  Gerald: { gender: "m", origin: "Germanic", meaning: "rule of the spear", note: "A Germanic name meaning 'rule of the spear', and the given name of President Gerald Ford." },
  Gloria: { gender: "f", origin: "Latin", meaning: "glory", note: "A Latin word for 'glory', and the name of the singer Gloria Estefan." },
  Grace: { gender: "f", origin: "Latin", meaning: "grace, favour", note: "A virtue name, and the actress Grace Kelly, later Princess of Monaco." },
  Grant: { gender: "m", origin: "Scottish", meaning: "great, tall", note: "A Scottish surname name, and the surname of the US president Ulysses S. Grant." },
  Grayson: { gender: "m", origin: "English", meaning: "son of the steward", zh: "格雷森", pinyin: "Gé léi sēn", note: "A surname meaning 'son of the steward' that has become a top US pick." },
  Gregory: { gender: "m", origin: "Greek", meaning: "watchful, alert", note: "The name of several popes, including Pope Gregory the Great." },
  Hannah: { gender: "f", origin: "Hebrew", meaning: "grace", note: "In the Bible, Hannah was the mother of the prophet Samuel." },
  Harold: { gender: "m", origin: "Norse", meaning: "army ruler", note: "The last Anglo-Saxon king of England before the Norman conquest was Harold II." },
  Harper: { gender: "f", origin: "English", meaning: "harp player", note: "A musical surname made famous by the author Harper Lee." },
  Hazel: { gender: "f", origin: "English", meaning: "the hazel tree", note: "A nature name from the hazel tree that has returned to fashion." },
  Heather: { gender: "f", origin: "English", meaning: "the heather plant", note: "A nature name from the flowering heather plant, big in the 1970s." },
  Helen: { gender: "f", origin: "Greek", meaning: "bright, shining light", note: "Helen of Troy, the most beautiful woman in Greek myth, bore this name." },
  Henry: { gender: "m", origin: "Germanic", meaning: "home ruler", note: "The name of eight English kings and of the industrialist Henry Ford." },
  Hudson: { gender: "m", origin: "English", meaning: "son of Hugh", zh: "哈德森", pinyin: "Hā dé sēn", note: "A surname of the explorer Henry Hudson, who charted the river and bay." },
  Hugo: { gender: "m", origin: "Germanic", meaning: "mind, spirit", note: "A Latin-rooted favourite, shared by the writer Victor Hugo." },
  Hunter: { gender: "m", origin: "English", meaning: "one who hunts", note: "An English occupational name that surged in the 1990s and 2000s." },
  Ian: { gender: "m", origin: "Scottish", meaning: "God is gracious (form of John)", note: "The Scottish form of John, carried by the author Ian Fleming." },
  Iris: { gender: "f", origin: "Greek", meaning: "rainbow", note: "The Greek goddess of the rainbow and a messenger of the gods." },
  Isaac: { gender: "m", origin: "Hebrew", meaning: "he will laugh", note: "In the Bible, Isaac was the long-awaited son of Abraham and Sarah." },
  Isabella: { gender: "f", origin: "Hebrew", meaning: "pledged to God (form of Elizabeth)", note: "A Spanish and Italian form of Elizabeth, carried by queens of Castile." },
  Isaiah: { gender: "m", origin: "Hebrew", meaning: "salvation of the Lord", zh: "艾赛亚", pinyin: "Ài sài yà", note: "The prophet Isaiah is a major figure of the Hebrew Bible." },
  Isla: { gender: "f", origin: "Scottish", meaning: "island (from the isle of Islay)", zh: "艾拉", pinyin: "Ài lā", note: "A Scottish name from the island of Islay, now a top UK pick." },
  Ivan: { gender: "m", origin: "Slavic", meaning: "God is gracious (form of John)", zh: "伊万", pinyin: "Yī wàn", note: "The Slavic form of John, and the name of several Russian tsars." },
  Ivy: { gender: "f", origin: "English", meaning: "the ivy plant", note: "A nature name from the climbing ivy plant, now a top US pick." },
  Jack: { gender: "m", origin: "English", meaning: "God is gracious (diminutive of John)", note: "A sturdy English classic and the name of the author Jack London." },
  Jackson: { gender: "m", origin: "English", meaning: "son of Jack", zh: "杰克逊", pinyin: "Jié kè xùn", note: "A surname of Andrew Jackson, the seventh US president." },
  Jacob: { gender: "m", origin: "Hebrew", meaning: "supplanter", note: "In the Bible, Jacob was the patriarch whose twelve sons founded the tribes of Israel." },
  Jacqueline: { gender: "f", origin: "French", meaning: "supplanter (feminine of Jacques)", note: "The name of Jacqueline Kennedy Onassis, the elegant US first lady." },
  Jade: { gender: "f", origin: "Spanish", meaning: "the jade stone", note: "A gemstone name, from the green stone prized in Chinese culture." },
  James: { gender: "m", origin: "Hebrew", meaning: "supplanter (form of Jacob)", note: "Carried by King James I of England, who commissioned the King James Bible." },
  Janet: { gender: "f", origin: "Hebrew", meaning: "God is gracious (diminutive of Jane)", note: "A diminutive of Jane, common in the mid-20th century." },
  Janice: { gender: "f", origin: "Hebrew", meaning: "God is gracious (form of Jane)", note: "A form of Jane that was a favourite of the 1940s and 1950s." },
  Jason: { gender: "m", origin: "Greek", meaning: "healer", note: "In Greek myth, Jason led the Argonauts on the quest for the Golden Fleece." },
  Jayden: { gender: "m", origin: "American", meaning: "thankful (a modern coinage)", zh: "杰登", pinyin: "Jié dēng", note: "A modern American coinage that shot to the top of the charts in the 2000s." },
  Jeffrey: { gender: "m", origin: "Germanic", meaning: "peace (form of Geoffrey)", note: "A friendly Germanic name that peaked in the mid-20th century." },
  Jennifer: { gender: "f", origin: "Welsh", meaning: "white wave (from Guinevere)", note: "From the Cornish form of Guinevere, the top US girls' name for years." },
  Jeremiah: { gender: "m", origin: "Hebrew", meaning: "appointed by God", zh: "杰里迈亚", pinyin: "Jié lǐ mài yà", note: "The prophet Jeremiah wrote of Jerusalem's fall and of a new covenant." },
  Jeremy: { gender: "m", origin: "Hebrew", meaning: "God will uplift (form of Jeremiah)", note: "A form of Jeremiah, popularised in Britain by the actor Jeremy Irons." },
  Jerry: { gender: "m", origin: "Germanic", meaning: "rule of the spear (short form)", note: "A friendly short form of Gerald or Jeremy, long common in the US." },
  Jesse: { gender: "m", origin: "Hebrew", meaning: "gift", note: "In the Bible, Jesse was the father of King David." },
  Jessica: { gender: "f", origin: "Hebrew", meaning: "to behold (from Shakespeare)", note: "Invented by Shakespeare for a character in The Merchant of Venice." },
  Joan: { gender: "f", origin: "Hebrew", meaning: "God is gracious (feminine of John)", note: "Joan of Arc, the French heroine and saint, bore this name." },
  Joel: { gender: "m", origin: "Hebrew", meaning: "Yahweh is God", zh: "乔尔", pinyin: "Qiáo ěr", note: "In the Bible, Joel was a minor prophet who foresaw the day of the Lord." },
  John: { gender: "m", origin: "Hebrew", meaning: "God is gracious", note: "One of the most enduring names in English, carried by kings, popes and apostles." },
  Jonah: { gender: "m", origin: "Hebrew", meaning: "dove", zh: "约拿", pinyin: "Yuē ná", note: "In the Bible, Jonah was swallowed by a great fish." },
  Jonathan: { gender: "m", origin: "Hebrew", meaning: "gift of God", note: "In the Bible, Jonathan was King Saul's son and David's loyal friend." },
  Jordan: { gender: "u", origin: "Hebrew", meaning: "flowing down (the River Jordan)", note: "Named after the River Jordan, where Jesus was baptised." },
  Joseph: { gender: "m", origin: "Hebrew", meaning: "God will add", note: "In the Bible, Joseph was sold into slavery by his brothers but rose to save Egypt." },
  Josephine: { gender: "f", origin: "French", meaning: "God will add (feminine of Joseph)", zh: "约瑟芬", pinyin: "Yuē sè fēn", note: "Josephine Baker, the dancer and French Resistance agent, bore this name." },
  Joshua: { gender: "m", origin: "Hebrew", meaning: "God is salvation", note: "Joshua led the Israelites into the Promised Land after Moses." },
  Josiah: { gender: "m", origin: "Hebrew", meaning: "God supports", zh: "约西亚", pinyin: "Yuē xī yà", note: "In the Bible, Josiah was a righteous young king of Judah." },
  Joyce: { gender: "f", origin: "Latin", meaning: "lord, or joyful", note: "A name linked to 'joy', and the surname of the author James Joyce." },
  Jude: { gender: "m", origin: "Hebrew", meaning: "praised", zh: "裘德", pinyin: "Qiú dé", note: "The name of the Beatles song 'Hey Jude', and of Saint Jude the apostle." },
  Judith: { gender: "f", origin: "Hebrew", meaning: "woman of Judea, praised", note: "In the Bible, Judith saved her people by defeating Holofernes." },
  Judy: { gender: "f", origin: "Hebrew", meaning: "praised (diminutive of Judith)", note: "A friendly short form of Judith, and the name of the actress Judy Garland." },
  Julia: { gender: "f", origin: "Latin", meaning: "youthful", zh: "朱莉娅", pinyin: "Zhū lì yà", note: "A Roman family name, and the name of the chef Julia Child." },
  Julian: { gender: "m", origin: "Latin", meaning: "youthful (from Julius)", note: "From the Roman name Julius, shared by the emperor Julian." },
  Julie: { gender: "f", origin: "Latin", meaning: "youthful (form of Julia)", note: "A French form of Julia that was a favourite of the 1960s." },
  Justin: { gender: "m", origin: "Latin", meaning: "just, righteous", note: "A Roman name meaning 'just', popularised by several early saints." },
  Kai: { gender: "m", origin: "Hawaiian", meaning: "sea", zh: "凯", pinyin: "Kǎi", note: "A short name with roots in Hawaiian ('sea') and several other cultures." },
  Karen: { gender: "f", origin: "Danish", meaning: "pure (form of Katherine)", note: "A Danish short form of Katherine that peaked in the mid-20th century." },
  Katherine: { gender: "f", origin: "Greek", meaning: "pure", note: "The name of the actress Katharine Hepburn and of Saint Catherine of Alexandria." },
  Kathleen: { gender: "f", origin: "Irish", meaning: "pure (form of Katherine)", note: "An Irish form of Katherine, common in Ireland and the US." },
  Keith: { gender: "m", origin: "Scottish", meaning: "wood, forest (of uncertain origin)", note: "A Scottish surname of uncertain origin that became a big 20th-century hit." },
  Kelly: { gender: "u", origin: "Irish", meaning: "warrior, bright-headed", note: "An Irish surname meaning 'warrior', popular for any gender in the 1970s." },
  Kenneth: { gender: "m", origin: "Scottish", meaning: "born of fire, or handsome", note: "A Scottish name of kings, from the Gaelic Cináed." },
  Kevin: { gender: "m", origin: "Irish", meaning: "kind, gentle", note: "Saint Kevin founded the monastery of Glendalough in Ireland." },
  Kimberly: { gender: "f", origin: "English", meaning: "royal fortress meadow", note: "A place name from South Africa that became a top US pick in the 1960s." },
  Kyle: { gender: "m", origin: "Scottish", meaning: "narrow strait (a place name)", note: "A Scottish place name from the Gaelic for 'narrow strait'." },
  Landon: { gender: "m", origin: "English", meaning: "long hill", zh: "兰登", pinyin: "Lán dēng", note: "An English surname name that entered the top ranks in the 2000s." },
  Larry: { gender: "m", origin: "Latin", meaning: "from Laurentum (short form of Lawrence)", note: "A friendly short form of Lawrence, shared by the TV host Larry King." },
  Laura: { gender: "f", origin: "Latin", meaning: "laurel", note: "The poet Petrarch's muse, and the name of the writer Laura Ingalls Wilder." },
  Lauren: { gender: "f", origin: "Latin", meaning: "laurel (feminine of Laurence)", note: "A feminine of Laurence that rose with the actress Lauren Bacall." },
  Lawrence: { gender: "m", origin: "Latin", meaning: "from Laurentum, laurel", note: "Saint Lawrence was a third-century Roman deacon and martyr." },
  Layla: { gender: "f", origin: "Arabic", meaning: "night", note: "Made famous by the Derek and the Dominos song 'Layla'." },
  Leo: { gender: "m", origin: "Latin", meaning: "lion", note: "A lion-hearted Latin name carried by thirteen popes." },
  Levi: { gender: "m", origin: "Hebrew", meaning: "joined, attached", note: "In the Bible, Levi was one of Jacob's twelve sons and ancestor of the priestly tribe." },
  Liam: { gender: "m", origin: "Irish", meaning: "resolute protector (short form of William)", note: "An Irish short form of William that has topped recent US charts." },
  Lillian: { gender: "f", origin: "Latin", meaning: "lily", zh: "莉莲", pinyin: "Lì lián", note: "A flower name from the Latin for 'lily', popular in the early 20th century." },
  Lily: { gender: "f", origin: "Latin", meaning: "the lily flower", note: "A flower name symbolising purity, a top pick in recent years." },
  Lincoln: { gender: "m", origin: "English", meaning: "town by the pool (a surname)", note: "The surname of Abraham Lincoln, the 16th president of the United States." },
  Linda: { gender: "f", origin: "Germanic", meaning: "beautiful, soft", note: "A Spanish word for 'beautiful' that was the US number one in the 1940s." },
  Lisa: { gender: "f", origin: "Hebrew", meaning: "pledged to God (short form of Elisabeth)", note: "A short form of Elisabeth that topped US charts in the 1960s." },
  Logan: { gender: "m", origin: "Scottish", meaning: "little hollow", note: "A Scottish name of a highland clan, later a comic-book hero surname." },
  Louis: { gender: "m", origin: "Germanic", meaning: "famous warrior", note: "The name of many French kings, including the sainted Louis IX." },
  Lucas: { gender: "m", origin: "Latin", meaning: "from Lucania", note: "A Latin form of Luke that has been a top pick across Europe and the Americas." },
  Lucy: { gender: "f", origin: "Latin", meaning: "light", zh: "露西", pinyin: "Lù xī", note: "Saint Lucy is the patron saint of the blind, and a heroine of the Peanuts comic." },
  Luke: { gender: "m", origin: "Greek", meaning: "from Lucania", zh: "卢克", pinyin: "Lú kè", note: "Saint Luke was a physician and the author of the third Gospel." },
  Luna: { gender: "f", origin: "Latin", meaning: "moon", zh: "卢娜", pinyin: "Lú nà", note: "The Roman goddess of the moon, and a character in the Harry Potter books." },
  Lydia: { gender: "f", origin: "Greek", meaning: "from Lydia (a region in Asia Minor)", zh: "莉迪娅", pinyin: "Lì dí yà", note: "In the New Testament, Lydia was a merchant who hosted Saint Paul." },
  Madison: { gender: "f", origin: "English", meaning: "son of Matthew (a surname)", note: "A surname of a US president that became a top girls' name after the film Splash." },
  Marco: { gender: "m", origin: "Italian", meaning: "warlike (form of Mark)", note: "The Italian form of Mark, and the name of the explorer Marco Polo." },
  Marcus: { gender: "m", origin: "Latin", meaning: "dedicated to Mars (the god of war)", note: "A Roman name tied to Mars, and the name of the emperor Marcus Aurelius." },
  Margaret: { gender: "f", origin: "Greek", meaning: "pearl", note: "The name of Saint Margaret and of the British prime minister Margaret Thatcher." },
  Maria: { gender: "f", origin: "Hebrew", meaning: "beloved, or bitter (form of Mary)", note: "The Latin form of Mary, and the name of the opera singer Maria Callas." },
  Mark: { gender: "m", origin: "Latin", meaning: "warlike (from Mars)", note: "The name of the Gospel writer Saint Mark." },
  Martha: { gender: "f", origin: "Aramaic", meaning: "lady, mistress", note: "In the Bible, Martha was the sister of Lazarus and a friend of Jesus." },
  Mary: { gender: "f", origin: "Hebrew", meaning: "beloved, or bitter (of uncertain origin)", note: "The mother of Jesus, and the most enduring girls' name in Christian history." },
  Mason: { gender: "m", origin: "English", meaning: "stone worker", note: "An English occupational surname that became a top-10 first name in the 2010s." },
  Matthew: { gender: "m", origin: "Hebrew", meaning: "gift of God", note: "Saint Matthew was a tax collector who became one of the twelve apostles." },
  Max: { gender: "m", origin: "Latin", meaning: "greatest", zh: "马克斯", pinyin: "Mǎ kè sī", note: "A Latin name meaning 'greatest', short for Maximilian or Maxwell." },
  Maya: { gender: "f", origin: "Greek", meaning: "mother, or illusion (multiple origins)", zh: "玛雅", pinyin: "Mǎ yǎ", note: "The poet Maya Angelou, and the Mesoamerican civilisation, share the name." },
  Megan: { gender: "f", origin: "Welsh", meaning: "pearl (diminutive of Margaret)", note: "A Welsh diminutive of Margaret, popular in Britain and America." },
  Melissa: { gender: "f", origin: "Greek", meaning: "bee, honey", note: "A Greek name meaning 'bee', and a nymph who cared for the infant Zeus." },
  Mia: { gender: "f", origin: "Latin", meaning: "mine, or bitter (diminutive of Maria)", note: "A short, bright name that has topped charts around the world." },
  Micah: { gender: "m", origin: "Hebrew", meaning: "who is like God?", zh: "迈卡", pinyin: "Mài kǎ", note: "The prophet Micah predicted that the Messiah would be born in Bethlehem." },
  Michael: { gender: "m", origin: "Hebrew", meaning: "who is like God?", note: "The archangel Michael, who leads heaven's armies, is the name's great bearer." },
  Michelle: { gender: "f", origin: "Hebrew", meaning: "who is like God? (feminine of Michael)", note: "The feminine of Michael, and the name of the US first lady Michelle Obama." },
  Miles: { gender: "m", origin: "Latin", meaning: "soldier (of uncertain origin)", note: "A short name shared by the jazz trumpeter Miles Davis." },
  Mohamed: { gender: "m", origin: "Arabic", meaning: "praised", note: "The name of the Prophet Muhammad, the founder of Islam." },
  Nancy: { gender: "f", origin: "Hebrew", meaning: "grace (diminutive of Ann)", note: "A diminutive of Ann, and the name of the detective Nancy Drew." },
  Naomi: { gender: "f", origin: "Hebrew", meaning: "pleasantness", zh: "内奥米", pinyin: "Nèi ào mǐ", note: "In the Bible, Naomi was the mother-in-law of Ruth." },
  Natalie: { gender: "f", origin: "Latin", meaning: "born on Christmas Day", note: "A Latin name for a Christmas-born child, carried by the actress Natalie Portman." },
  Nathan: { gender: "m", origin: "Hebrew", meaning: "he gave", note: "In the Bible, Nathan was the prophet who rebuked King David." },
  Nicholas: { gender: "m", origin: "Greek", meaning: "victory of the people", note: "Saint Nicholas, the fourth-century bishop, is the model for Santa Claus." },
  Nicole: { gender: "f", origin: "Greek", meaning: "victory of the people (feminine of Nicholas)", note: "The feminine of Nicholas, hugely popular in the 1970s and 1980s." },
  Noah: { gender: "m", origin: "Hebrew", meaning: "rest, comfort", note: "Noah built the ark that saved his family and the animals from the flood." },
  Nolan: { gender: "m", origin: "Irish", meaning: "noble, famous", zh: "诺兰", pinyin: "Nuò lán", note: "An Irish surname of the Nolan family, now a rising first name." },
  Nora: { gender: "f", origin: "Irish", meaning: "honour, light", note: "A short form of Honora or Eleanora, and the heroine of Ibsen's A Doll's House." },
  Oliver: { gender: "m", origin: "Latin", meaning: "olive tree", note: "A literary favourite from Charles Dickens' Oliver Twist." },
  Olivia: { gender: "f", origin: "Latin", meaning: "olive tree", note: "Invented by Shakespeare for Twelfth Night, now a top name worldwide." },
  Omar: { gender: "m", origin: "Arabic", meaning: "flourishing, long-lived", note: "The second caliph of Islam, Omar ibn al-Khattab, bore this name." },
  Owen: { gender: "m", origin: "Welsh", meaning: "young warrior, or well-born", note: "A Welsh name meaning 'young warrior', shared by the writer Wilfred Owen." },
  Pamela: { gender: "f", origin: "Greek", meaning: "all honey (invented by Sidney)", note: "A name invented by the poet Philip Sidney in his romance Arcadia." },
  Parker: { gender: "m", origin: "English", meaning: "park keeper", zh: "帕克", pinyin: "Pà kè", note: "An English surname for a park keeper that works for any gender." },
  Patricia: { gender: "f", origin: "Latin", meaning: "noblewoman", note: "The feminine of Patrick, and a top mid-century pick." },
  Patrick: { gender: "m", origin: "Latin", meaning: "nobleman", note: "Saint Patrick is the patron saint of Ireland." },
  Paul: { gender: "m", origin: "Latin", meaning: "small, humble", note: "Saint Paul spread early Christianity across the Roman world." },
  Penelope: { gender: "f", origin: "Greek", meaning: "weaver (of uncertain origin)", note: "In Homer's Odyssey, Penelope waited faithfully for Odysseus." },
  Peter: { gender: "m", origin: "Greek", meaning: "rock, stone", note: "Saint Peter, a fisherman, became the first leader of the early church." },
  Philip: { gender: "m", origin: "Greek", meaning: "lover of horses", note: "Philip of Macedon was the father of Alexander the Great." },
  Quinn: { gender: "u", origin: "Irish", meaning: "descendant of Conn", zh: "奎因", pinyin: "Kuí yīn", note: "An Irish surname meaning 'descendant of Conn' that suits any gender." },
  Rachel: { gender: "f", origin: "Hebrew", meaning: "ewe", note: "In the Bible, Rachel was the beloved wife of Jacob." },
  Rafael: { gender: "m", origin: "Hebrew", meaning: "God has healed (form of Raphael)", note: "The archangel Raphael, a healer, appears in the Book of Tobit." },
  Ralph: { gender: "m", origin: "Norse", meaning: "wolf counsel", note: "The name of the writer Ralph Waldo Emerson." },
  Raymond: { gender: "m", origin: "Germanic", meaning: "wise protector", note: "A Germanic name meaning 'wise protector', common across Europe." },
  Rebecca: { gender: "f", origin: "Hebrew", meaning: "to bind, captivating", note: "In the Bible, Rebecca was the wife of Isaac and mother of Jacob and Esau." },
  Richard: { gender: "m", origin: "Germanic", meaning: "brave ruler", note: "Richard the Lionheart, the crusader king, is the name's most famous bearer." },
  Riley: { gender: "u", origin: "Irish", meaning: "valiant", note: "An Irish surname meaning 'valiant' that now suits any gender." },
  Robert: { gender: "m", origin: "Germanic", meaning: "bright fame", note: "Robert the Bruce led Scotland to independence from England." },
  Roger: { gender: "m", origin: "Germanic", meaning: "famous spear", note: "A Germanic name that was a favourite of medieval England." },
  Roman: { gender: "m", origin: "Latin", meaning: "citizen of Rome", zh: "罗曼", pinyin: "Luó màn", note: "From the Latin for a citizen of Rome." },
  Ronald: { gender: "m", origin: "Norse", meaning: "ruler's counsel", note: "The given name of the US president Ronald Reagan." },
  Rose: { gender: "f", origin: "Latin", meaning: "the rose flower", note: "A classic flower name symbolising love." },
  Roy: { gender: "m", origin: "Gaelic", meaning: "red, or king", note: "A Gaelic name meaning 'red' or 'king', and the name of the singer Roy Orbison." },
  Ruby: { gender: "f", origin: "Latin", meaning: "the red gemstone", note: "A gemstone name from the deep-red stone, revived in the 2000s." },
  Ruth: { gender: "f", origin: "Hebrew", meaning: "friend, companion", note: "In the Bible, Ruth's loyalty to her mother-in-law Naomi is celebrated." },
  Ryan: { gender: "m", origin: "Irish", meaning: "little king", note: "An Irish surname meaning 'little king' that became a top US pick." },
  Sadie: { gender: "f", origin: "Hebrew", meaning: "princess (diminutive of Sarah)", zh: "萨迪", pinyin: "Sà dí", note: "A Hebrew diminutive of Sarah that has become a favourite in its own right." },
  Samantha: { gender: "f", origin: "Aramaic", meaning: "listener (of uncertain origin)", note: "A name that rose to fame through the 1960s TV show Bewitched." },
  Samuel: { gender: "m", origin: "Hebrew", meaning: "heard by God", note: "In the Bible, Samuel was the prophet who anointed the first kings of Israel." },
  Sandra: { gender: "f", origin: "Greek", meaning: "defender of the people (short form of Alexandra)", note: "A short form of Alexandra that was a top pick in the 1940s." },
  Sarah: { gender: "f", origin: "Hebrew", meaning: "princess", note: "In the Bible, Sarah was the wife of Abraham and mother of Isaac." },
  Savannah: { gender: "f", origin: "Spanish", meaning: "treeless plain", zh: "萨凡纳", pinyin: "Sà fán nà", note: "A place name from the grassy plains, and the city of Savannah, Georgia." },
  Sawyer: { gender: "m", origin: "English", meaning: "woodcutter", zh: "索耶", pinyin: "Suǒ yē", note: "An English surname for a woodcutter, and the hero of Mark Twain's Tom Sawyer." },
  Scarlett: { gender: "f", origin: "English", meaning: "red (a colour and surname)", note: "The heroine of Gone with the Wind, Scarlett O'Hara, gave the name its fire." },
  Scott: { gender: "m", origin: "English", meaning: "from Scotland", note: "From the surname for someone from Scotland; carried by the author F. Scott Fitzgerald." },
  Sean: { gender: "m", origin: "Irish", meaning: "God is gracious (form of John)", note: "The Irish form of John, carried by the actor Sean Connery." },
  Sebastian: { gender: "m", origin: "Greek", meaning: "venerable, revered", zh: "塞巴斯蒂安", pinyin: "Sài bā sī dì ān", note: "Saint Sebastian was a Roman martyr pierced by arrows." },
  Seth: { gender: "m", origin: "Hebrew", meaning: "appointed", note: "In the Bible, Seth was the third son of Adam and Eve." },
  Shane: { gender: "m", origin: "Irish", meaning: "God is gracious (form of John)", note: "An anglicised Irish form of John, made famous by the western novel Shane." },
  Sharon: { gender: "f", origin: "Hebrew", meaning: "the plain of Sharon", note: "A place name from the fertile plain of Sharon in Israel." },
  Shawn: { gender: "m", origin: "Irish", meaning: "God is gracious (form of John)", note: "A spelling variant of Sean, popular in North America." },
  Shirley: { gender: "f", origin: "English", meaning: "bright meadow (a place name)", note: "A surname-turned-first-name made famous by the child star Shirley Temple." },
  Silas: { gender: "m", origin: "Latin", meaning: "of the forest", zh: "赛拉斯", pinyin: "Sài lā sī", note: "In the New Testament, Silas travelled with Saint Paul." },
  Simon: { gender: "m", origin: "Hebrew", meaning: "he has heard", zh: "西蒙", pinyin: "Xī méng", note: "Simon Peter, renamed Peter by Jesus, was the first leader of the church." },
  Sofia: { gender: "f", origin: "Greek", meaning: "wisdom", note: "A Greek name meaning 'wisdom', a top pick across Europe." },
  Sophia: { gender: "f", origin: "Greek", meaning: "wisdom", note: "The Greek word for 'wisdom', and the name of a famous basilica in Istanbul." },
  Stella: { gender: "f", origin: "Latin", meaning: "star", note: "A Latin name meaning 'star', revived in the 21st century." },
  Stephanie: { gender: "f", origin: "Greek", meaning: "crown (feminine of Stephen)", note: "The feminine of Stephen, popular in the 1970s and 1980s." },
  Stephen: { gender: "m", origin: "Greek", meaning: "crown", note: "Saint Stephen was the first Christian martyr." },
  Steven: { gender: "m", origin: "Greek", meaning: "crown (variant of Stephen)", note: "A variant of Stephen that became hugely popular in the mid-20th century." },
  Summer: { gender: "f", origin: "English", meaning: "the summer season", note: "A cheerful season name that rose in the 1970s." },
  Susan: { gender: "f", origin: "Hebrew", meaning: "lily (from Susanna)", note: "A Hebrew name meaning 'lily', from the biblical Susanna." },
  Teresa: { gender: "f", origin: "Greek", meaning: "harvest (of uncertain origin)", note: "The name of the saint Mother Teresa, who cared for the poor of Calcutta." },
  Terry: { gender: "m", origin: "Latin", meaning: "tender (short form of Terence)", note: "A friendly short form of Terence, common in the mid-20th century." },
  Theodore: { gender: "m", origin: "Greek", meaning: "gift of God", zh: "西奥多", pinyin: "Xī ào duō", note: "The name of the US president Theodore 'Teddy' Roosevelt." },
  Thomas: { gender: "m", origin: "Aramaic", meaning: "twin", note: "Saint Thomas was the apostle who doubted until he saw Jesus." },
  Timothy: { gender: "m", origin: "Greek", meaning: "honouring God", note: "In the New Testament, Timothy was a young companion of Saint Paul." },
  Trevor: { gender: "m", origin: "Welsh", meaning: "large settlement", note: "A Welsh name meaning 'large settlement', common in Britain and America." },
  Tristan: { gender: "m", origin: "Celtic", meaning: "sorrowful, or noise", note: "In the legend of Tristan and Isolde, Tristan is a Cornish knight." },
  Tyler: { gender: "m", origin: "English", meaning: "tile maker (a surname)", note: "An English surname for a tile maker that topped the US charts in the 1990s." },
  Victor: { gender: "m", origin: "Latin", meaning: "conqueror", note: "A Roman name meaning 'conqueror', shared by the writer Victor Hugo." },
  Victoria: { gender: "f", origin: "Latin", meaning: "victory", note: "The name of Queen Victoria, who gave her name to a whole era." },
  Vincent: { gender: "m", origin: "Latin", meaning: "conquering", note: "The painter Vincent van Gogh carried this name." },
  Violet: { gender: "f", origin: "Latin", meaning: "the violet flower", note: "A flower name from the purple bloom, revived in the 2000s." },
  Virginia: { gender: "f", origin: "Latin", meaning: "maiden (from a Roman family name)", note: "Named for the US state, which honours Elizabeth I, the 'Virgin Queen'." },
  Walter: { gender: "m", origin: "Germanic", meaning: "army ruler", note: "The name of the writer Sir Walter Scott." },
  Wayne: { gender: "m", origin: "English", meaning: "wagon maker (a surname)", note: "Made famous by the actor John Wayne." },
  Wesley: { gender: "m", origin: "English", meaning: "west meadow", zh: "韦斯利", pinyin: "Wéi sī lì", note: "The surname of John Wesley, founder of Methodism." },
  William: { gender: "m", origin: "Germanic", meaning: "resolute protector", note: "William Shakespeare and William the Conqueror are the name's great bearers." },
  Willow: { gender: "f", origin: "English", meaning: "the willow tree", note: "A nature name from the graceful willow tree." },
  Wyatt: { gender: "m", origin: "English", meaning: "brave in war", zh: "怀亚特", pinyin: "Huái yà tè", note: "Wyatt Earp, the lawman of the American frontier, bore this name." },
  Xavier: { gender: "m", origin: "Basque", meaning: "new house, or bright", note: "Saint Francis Xavier was a pioneering Jesuit missionary." },
  Zachary: { gender: "m", origin: "Hebrew", meaning: "God has remembered", note: "In the Bible, Zechariah was the father of John the Baptist." },
  Zoe: { gender: "f", origin: "Greek", meaning: "life", note: "A Greek name meaning 'life', shared by the actress Zoë Kravitz." },
};

// A short English gloss for every Chinese character used in the transliterations.
// Used to render the "character by character" section. These are the characters'
// own dictionary meanings — the names themselves are chosen by sound, not meaning.
const CHAR_MEANINGS = {
  东: "east", 丝: "silk, thread", 丹: "cinnabar, red", 丽: "beautiful",
  乔: "tall, lofty", 亚: "Asia, second", 亨: "prosperous, smooth", 什: "miscellaneous",
  以: "by means of, with", 伊: "he, she (classical)", 伦: "human relations, ethics", 伯: "uncle, earl",
  佐: "assist", 佩: "wear, admire", 保: "protect", 修: "cultivate, repair",
  克: "overcome, gram", 兰: "orchid", 兹: "this, now", 内: "inside",
  凯: "triumphant, victorious", 切: "cut, close", 利: "sharp, benefit", 加: "add",
  劳: "labor, toil", 勒: "rein in, engrave", 华: "splendid, China", 南: "south",
  博: "broad, learned", 卡: "card, checkpoint", 卢: "hut (a surname)", 历: "experience, calendar",
  古: "ancient", 史: "history", 各: "each", 吉: "lucky",
  哈: "ha (a laugh)", 唐: "the Tang dynasty", 坦: "flat, open", 埃: "dust",
  基: "base, foundation", 塔: "tower, pagoda", 塞: "block, fort", 夏: "summer",
  多: "many", 大: "big", 夫: "man, husband", 奎: "a constellation, stride",
  奥: "profound, Austria", 妮: "girl, maid", 姆: "nursemaid, mother", 威: "power, might",
  娅: "aunt by marriage (in names)", 娜: "elegant (in names)", 安: "peace, safe", 尔: "you, thus",
  尤: "especially", 尼: "nun (transliteration)", 山: "mountain", 布: "cloth, spread",
  希: "hope, rare", 帕: "handkerchief", 库: "warehouse", 康: "health, peace",
  廉: "honest, incorruptible", 廷: "court", 弗: "not", 当: "ought, match",
  彼: "that, other", 得: "obtain", 德: "virtue, morality", 思: "think, thought",
  恩: "grace, favor", 戈: "spear, weapon", 戴: "wear, respect", 扎: "bind, prick",
  托: "support, entrust", 拉: "pull", 文: "writing, culture", 斐: "rich in literary grace",
  斯: "this (transliteration)", 明: "bright", 易: "easy, change", 普: "general, universal",
  曼: "graceful, long", 朗: "clear, bright", 本: "root, origin", 朱: "vermilion",
  杰: "outstanding", 林: "forest", 果: "fruit, result", 查: "inspect",
  根: "root", 格: "pattern, standard", 桑: "mulberry", 梅: "plum",
  森: "forest", 欧: "Europe (a surname)", 歇: "rest", 比: "compare",
  汀: "shore, sandbar", 汉: "Han, Chinese, man", 沃: "fertile, irrigate", 治: "govern, cure",
  泰: "peaceful, grand", 泽: "marsh, grace", 洛: "the Luo river", 海: "sea",
  烈: "fierce, intense", 爱: "love", 特: "special", 玛: "agate",
  珀: "amber", 珊: "coral", 珍: "treasure, precious", 理: "reason, texture",
  琳: "beautiful jade", 琼: "fine jade", 瑞: "auspicious, lucky", 瑟: "a zither (transliteration)",
  瓦: "tile", 甘: "sweet", 登: "ascend", 白: "white",
  盖: "lid, cover", 科: "science, subject", 穆: "solemn, respectful", 米: "rice",
  索: "rope, search", 约: "pact, about", 纳: "receive, accept", 维: "maintain, dimension",
  缪: "entwine (transliteration)", 罕: "rare", 罗: "net, collect", 翰: "writing brush (a surname)",
  肖: "resemble", 肯: "willing", 舒: "stretch, comfortable", 艾: "mugwort, artemisia",
  芙: "lotus", 芬: "fragrance", 芭: "a plant (transliteration)", 苏: "revive (a surname)",
  莉: "jasmine", 莎: "sedge, a plant", 莫: "no, none", 莱: "a herb (transliteration)",
  菲: "fragrant (a plant)", 萝: "radish, trailing plant", 萨: "bodhisattva (transliteration)", 蒂: "stem (of fruit)",
  蒙: "cover, deceive", 蕾: "bud", 薇: "a fern, rose (in names)", 西: "west",
  詹: "verbose (a surname)", 诺: "promise", 谢: "thank", 贝: "shell, cowrie",
  费: "fee, cost", 贾: "merchant (a surname)", 赖: "rely", 路: "road",
  辛: "bitter, laborious", 达: "reach", 迈: "stride", 迪: "enlighten, guide",
  迭: "alternate", 逊: "humble, yielding", 里: "inside, a mile", 金: "gold, metal",
  阿: "a prefix, hill", 雅: "elegant, refined", 雨: "rain", 雪: "snow",
  雷: "thunder", 露: "dew, reveal", 韦: "leather (a surname)", 马: "horse",
  鲁: "blunt, the state of Lu", 麦: "wheat", 黑: "black", 默: "silent",
  黛: "dark blue (eyebrow pigment)", 怀: "bosom, cherish", 赛: "contest, match", 裘: "fur coat (a surname)",
  舍: "house, give up", 莲: "lotus", 娃: "baby, doll", 典: "canon, classic",
  因: "cause, because", 凡: "ordinary, every", 生: "birth, life, student",
  蔡: "a herb (a surname)", 万: "ten thousand", 拿: "take, hold", 耶: "a final particle (transliteration)",
  巴: "to long for, a place name",
};

const slugFor = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

function main() {
  const existing = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const names = {};

  for (const [name, content] of Object.entries(CONTENT)) {
    const prev = existing.names && existing.names[name];
    if (prev) {
      names[name] = {
        zh: prev.zh,
        pinyin: prev.pinyin || "",
        gender: content.gender,
        origin: content.origin,
        meaning: content.meaning,
        note: content.note,
      };
    } else {
      if (!content.zh || !content.pinyin) {
        throw new Error(`${name}: new names need zh and pinyin in CONTENT`);
      }
      names[name] = {
        zh: content.zh,
        pinyin: content.pinyin,
        gender: content.gender,
        origin: content.origin,
        meaning: content.meaning,
        note: content.note,
      };
    }
  }

  // Every name already in the file must have content, and vice versa.
  for (const name of Object.keys(existing.names || {})) {
    if (name.startsWith("_")) continue;
    if (!names[name]) throw new Error(`existing name ${name} is missing from CONTENT`);
  }

  // Validate fields and font coverage of every Chinese character.
  const allChars = new Set();
  for (const [name, entry] of Object.entries(names)) {
    for (const field of ["zh", "gender", "origin", "meaning", "note"]) {
      if (!entry[field]) throw new Error(`${name}: missing ${field}`);
    }
    if (!["m", "f", "u"].includes(entry.gender)) throw new Error(`${name}: bad gender ${entry.gender}`);
    for (const ch of entry.zh) {
      allChars.add(ch);
      if (!CHAR_MEANINGS[ch]) throw new Error(`${name}: no meaning for character ${ch}`);
    }
  }

  // Slug collisions.
  const slugs = new Map();
  for (const name of Object.keys(names)) {
    const slug = slugFor(name);
    if (slugs.has(slug) && slugs.get(slug) !== name) {
      throw new Error(`slug collision: ${slugs.get(slug)} and ${name} -> ${slug}`);
    }
    slugs.set(slug, name);
  }

  const sorted = {};
  for (const name of Object.keys(names).sort((a, b) => a.localeCompare(b))) {
    sorted[name] = names[name];
  }

  const out = {
    _note: existing._note,
    _pinyinNote: existing._pinyinNote,
    _charMeanings: CHAR_MEANINGS,
    names: sorted,
  };
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${Object.keys(sorted).length} names and ${Object.keys(CHAR_MEANINGS).length} character meanings to data/names-zh.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
