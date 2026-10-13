import bcrypt from "bcryptjs";
import { logger } from "./logger";
import {
  EventCaseModel,
  QuestionModel,
  SubjectModel,
  TournamentModel,
  UserModel,
} from "./nexora-models";

const ranks = ["E", "D", "C", "B", "A", "S"] as const;
type SampleQuestion = { prompt: string; options: [string, string, string, string]; answer: number; explanation: string };

const sampleQuestions: Record<string, SampleQuestion[]> = {
  Math: [
    { prompt: "Differentiate f(x) = x².", options: ["2x", "x", "x²", "2"], answer: 0, explanation: "The power rule gives d(x²)/dx = 2x." },
    { prompt: "Solve 2x + 3 = 11.", options: ["4", "7", "8", "14"], answer: 0, explanation: "Subtract 3 to get 2x = 8, then divide by 2." },
    { prompt: "What is the sum of the first five positive integers?", options: ["10", "15", "20", "25"], answer: 1, explanation: "1 + 2 + 3 + 4 + 5 = 15." },
    { prompt: "For y = 3x − 4, what is the slope?", options: ["−4", "3", "4", "−3"], answer: 1, explanation: "In y = mx + b, the coefficient m is the slope." },
    { prompt: "What is the positive solution to x² = 49?", options: ["−7", "7", "14", "49"], answer: 1, explanation: "The square roots are ±7; the positive solution is 7." },
    { prompt: "Solve x² − 5x + 6 = 0.", options: ["x = 2 or 3", "x = −2 or −3", "x = 1 or 6", "x = −1 or −6"], answer: 0, explanation: "Factor as (x − 2)(x − 3) = 0." },
    { prompt: "Evaluate ∫₀³ 2x dx.", options: ["6", "9", "12", "18"], answer: 1, explanation: "An antiderivative is x², and 3² − 0² = 9." },
    { prompt: "Find the slope through (0, 2) and (2, 6).", options: ["1", "2", "3", "4"], answer: 1, explanation: "Slope = (6 − 2) ÷ (2 − 0) = 2." },
    { prompt: "What is the positive solution to |x − 3| = 5?", options: ["2", "5", "8", "−8"], answer: 2, explanation: "x − 3 = 5 gives x = 8; the other solution is −2." },
    { prompt: "A fair coin is tossed once. What is the probability of heads?", options: ["¼", "⅓", "½", "1"], answer: 2, explanation: "One of the two equally likely outcomes is heads." },
    { prompt: "What is sin 30°?", options: ["0", "½", "√2/2", "1"], answer: 1, explanation: "The exact trigonometric value of sin 30° is 1/2." },
    { prompt: "What comes next in the geometric sequence 3, 6, 12, …?", options: ["15", "18", "24", "36"], answer: 2, explanation: "Each term is multiplied by 2, so 12 × 2 = 24." },
    { prompt: "Find the determinant of [[1, 2], [3, 4]].", options: ["−2", "2", "10", "−10"], answer: 0, explanation: "The determinant is 1×4 − 2×3 = −2." },
    { prompt: "What is the magnitude of vector (3, 4)?", options: ["4", "5", "7", "25"], answer: 1, explanation: "Magnitude = √(3² + 4²) = √25 = 5." },
    { prompt: "Evaluate log₁₀(1000).", options: ["2", "3", "10", "100"], answer: 1, explanation: "10³ = 1000, so log₁₀(1000) = 3." },
  ],
  Physics: [
    { prompt: "A 3 kg object accelerates at 2 m/s². What is the net force?", options: ["1.5 N", "5 N", "6 N", "9 N"], answer: 2, explanation: "Newton’s second law gives F = ma = 3 × 2 = 6 N." },
    { prompt: "A car travels 120 m in 10 s. What is its average speed?", options: ["10 m/s", "12 m/s", "20 m/s", "1200 m/s"], answer: 1, explanation: "Average speed = distance ÷ time = 120 ÷ 10." },
    { prompt: "What is the SI unit of electric current?", options: ["Volt", "Ohm", "Ampere", "Watt"], answer: 2, explanation: "Electric current is measured in amperes (A)." },
    { prompt: "A 4 Ω resistor carries 2 A. What is the voltage across it?", options: ["2 V", "6 V", "8 V", "16 V"], answer: 2, explanation: "Ohm’s law gives V = IR = 2 × 4 = 8 V." },
    { prompt: "Ignoring air resistance, what is the acceleration of a falling object near Earth?", options: ["0 m/s²", "About 9.8 m/s² downward", "About 9.8 m/s² upward", "It depends on its mass"], answer: 1, explanation: "Gravitational acceleration near Earth's surface is about 9.8 m/s² downward." },
    { prompt: "A body changes velocity from 4 m/s to 16 m/s in 3 s. What is its acceleration?", options: ["3 m/s²", "4 m/s²", "6 m/s²", "12 m/s²"], answer: 1, explanation: "Acceleration = change in velocity ÷ time = (16 − 4) ÷ 3 = 4 m/s²." },
    { prompt: "What is the momentum of a 2 kg object moving at 5 m/s?", options: ["2.5 kg·m/s", "7 kg·m/s", "10 kg·m/s", "25 kg·m/s"], answer: 2, explanation: "Momentum p = mv = 2 × 5 = 10 kg·m/s." },
    { prompt: "How much kinetic energy does a 2 kg mass have at 3 m/s?", options: ["3 J", "6 J", "9 J", "18 J"], answer: 2, explanation: "Kinetic energy = ½mv² = ½ × 2 × 9 = 9 J." },
    { prompt: "A wave has frequency 5 Hz and wavelength 2 m. What is its speed?", options: ["2.5 m/s", "7 m/s", "10 m/s", "25 m/s"], answer: 2, explanation: "Wave speed v = fλ = 5 × 2 = 10 m/s." },
    { prompt: "Two 6 Ω resistors are connected in series. What is the total resistance?", options: ["3 Ω", "6 Ω", "12 Ω", "36 Ω"], answer: 2, explanation: "Series resistances add: 6 + 6 = 12 Ω." },
    { prompt: "A device transfers 600 J of energy in 20 s. What is its power?", options: ["20 W", "30 W", "120 W", "12,000 W"], answer: 1, explanation: "Power = energy ÷ time = 600 ÷ 20 = 30 W." },
    { prompt: "A 2 m wave has frequency 3 Hz. What is its period?", options: ["⅓ s", "2 s", "3 s", "6 s"], answer: 0, explanation: "Period T = 1/f = 1/3 s." },
    { prompt: "How much heat raises 1 kg of water by 2°C? Use c = 4200 J/(kg·°C).", options: ["2100 J", "4200 J", "8400 J", "16,800 J"], answer: 2, explanation: "Q = mcΔT = 1 × 4200 × 2 = 8400 J." },
    { prompt: "A 12 V source is connected to a 4 Ω resistor. What current flows?", options: ["0.33 A", "3 A", "8 A", "48 A"], answer: 1, explanation: "Ohm’s law gives I = V/R = 12/4 = 3 A." },
    { prompt: "A lens forms a real image when an object is placed beyond its:", options: ["Optical center", "Principal focus", "Aperture", "Frame"], answer: 1, explanation: "For a converging lens, objects beyond the principal focus form real images." },
  ],
  Chemistry: [
    { prompt: "What is the chemical symbol for sodium?", options: ["S", "So", "Na", "N"], answer: 2, explanation: "Sodium's chemical symbol is Na, from the Latin natrium." },
    { prompt: "A neutral aqueous solution at 25°C has a pH of:", options: ["0", "5", "7", "14"], answer: 2, explanation: "At 25°C, neutral water has pH 7." },
    { prompt: "How many protons are in a carbon-12 atom?", options: ["6", "12", "18", "Carbon has none"], answer: 0, explanation: "Carbon's atomic number is 6, so it has six protons." },
    { prompt: "Which bond forms when atoms share electron pairs?", options: ["Ionic", "Covalent", "Metallic", "Hydrogen"], answer: 1, explanation: "Covalent bonds form through shared electron pairs." },
    { prompt: "What is the relative molecular mass of H₂O? (H = 1, O = 16)", options: ["16", "17", "18", "20"], answer: 2, explanation: "H₂O has mass 2(1) + 16 = 18." },
    { prompt: "How many moles are in 0.5 L of a 2 mol/L solution?", options: ["0.25 mol", "0.5 mol", "1 mol", "4 mol"], answer: 2, explanation: "Amount n = concentration × volume = 2 × 0.5 = 1 mol." },
    { prompt: "How many neutrons are in sodium-23? (Atomic number 11)", options: ["11", "12", "23", "34"], answer: 1, explanation: "Neutrons = mass number − atomic number = 23 − 11 = 12." },
    { prompt: "Which coefficients balance H₂ + O₂ → H₂O?", options: ["1, 1, 1", "2, 1, 2", "1, 2, 1", "2, 2, 1"], answer: 1, explanation: "2H₂ + O₂ → 2H₂O balances four H atoms and two O atoms." },
    { prompt: "What is the oxidation number of oxygen in most compounds?", options: ["−2", "−1", "0", "+2"], answer: 0, explanation: "Oxygen usually has oxidation number −2, with known exceptions." },
    { prompt: "What volume does 1 mole of an ideal gas occupy at STP? (Use 22.4 L/mol)", options: ["1 L", "11.2 L", "22.4 L", "44.8 L"], answer: 2, explanation: "At the stated STP convention, 1 mol occupies 22.4 L." },
    { prompt: "How many valence electrons does a neutral oxygen atom have?", options: ["2", "4", "6", "8"], answer: 2, explanation: "Oxygen is in group 16 and has six valence electrons." },
    { prompt: "Which change is exothermic?", options: ["Ice melting", "Water evaporating", "Steam condensing", "Solid iodine subliming"], answer: 2, explanation: "Condensation releases heat to the surroundings." },
    { prompt: "What is the molar mass of CO₂? (C = 12, O = 16)", options: ["28 g/mol", "32 g/mol", "44 g/mol", "48 g/mol"], answer: 2, explanation: "12 + 2(16) = 44 g/mol." },
    { prompt: "Which ion does an acid donate in the Brønsted–Lowry model?", options: ["H⁺", "OH⁻", "Na⁺", "Cl⁻"], answer: 0, explanation: "A Brønsted–Lowry acid is a proton (H⁺) donor." },
    { prompt: "Which element is most electronegative?", options: ["Sodium", "Carbon", "Oxygen", "Fluorine"], answer: 3, explanation: "Fluorine has the highest electronegativity on the Pauling scale." },
  ],
  Biology: [
    { prompt: "Which organelle is the main site of aerobic respiration?", options: ["Ribosome", "Mitochondrion", "Nucleus", "Vacuole"], answer: 1, explanation: "Most aerobic respiration occurs in the mitochondria." },
    { prompt: "Which molecule carries hereditary information in most organisms?", options: ["ATP", "DNA", "Starch", "Hemoglobin"], answer: 1, explanation: "DNA stores genetic information in its nucleotide sequence." },
    { prompt: "What is the main gas released during photosynthesis?", options: ["Carbon dioxide", "Nitrogen", "Oxygen", "Hydrogen"], answer: 2, explanation: "Water is split during the light reactions, releasing oxygen." },
    { prompt: "What is the functional filtering unit of the kidney?", options: ["Neuron", "Alveolus", "Nephron", "Villus"], answer: 2, explanation: "Nephrons filter blood and form urine." },
    { prompt: "How many daughter cells does mitosis usually produce?", options: ["One", "Two genetically similar cells", "Four genetically different cells", "Eight"], answer: 1, explanation: "Mitosis produces two genetically similar daughter cells." },
    { prompt: "Which organelle carries out most photosynthesis in a plant cell?", options: ["Mitochondrion", "Chloroplast", "Golgi body", "Lysosome"], answer: 1, explanation: "Chloroplasts contain chlorophyll and carry out photosynthesis." },
    { prompt: "Which blood cells transport most oxygen?", options: ["Platelets", "Red blood cells", "White blood cells", "Lymphocytes"], answer: 1, explanation: "Hemoglobin in red blood cells binds and transports oxygen." },
    { prompt: "In a simple food chain, organisms that make their own food are:", options: ["Consumers", "Decomposers", "Producers", "Predators"], answer: 2, explanation: "Producers, such as plants, convert energy into organic matter." },
    { prompt: "Which process produces gametes with half the usual chromosome number?", options: ["Mitosis", "Meiosis", "Budding", "Binary fission"], answer: 1, explanation: "Meiosis reduces chromosome number by half to form haploid gametes." },
    { prompt: "Which molecule is the immediate energy source for many cell processes?", options: ["ATP", "DNA", "Cellulose", "Urea"], answer: 0, explanation: "ATP transfers usable energy for cellular processes." },
    { prompt: "Where does gas exchange occur in the human lungs?", options: ["Trachea", "Bronchi", "Alveoli", "Diaphragm"], answer: 2, explanation: "Thin-walled alveoli provide a large surface for gas exchange." },
    { prompt: "Which part of a neuron usually receives incoming signals?", options: ["Dendrites", "Axon terminal", "Myelin sheath", "Cell wall"], answer: 0, explanation: "Dendrites receive signals and carry them toward the cell body." },
    { prompt: "A heterozygous genotype Tt is crossed with Tt. What fraction is expected to be tt?", options: ["0", "¼", "½", "¾"], answer: 1, explanation: "The genotypes are TT, Tt, Tt, tt, so one quarter are tt." },
    { prompt: "Which plant tissue transports water from roots upward?", options: ["Phloem", "Xylem", "Epidermis", "Cortex"], answer: 1, explanation: "Xylem conducts water and minerals from roots through the plant." },
    { prompt: "What is the main role of decomposers in an ecosystem?", options: ["Make sunlight", "Recycle nutrients from dead matter", "Remove all predators", "Stop photosynthesis"], answer: 1, explanation: "Decomposers break down dead material and return nutrients to ecosystems." },
  ],
  English: [
    { prompt: "Choose the correct passive form: “The students solved the problem.”", options: ["The problem solves the students.", "The problem was solved by the students.", "The students were solved by the problem.", "The problem is solving the students."], answer: 1, explanation: "Past simple passive uses was/were + past participle." },
    { prompt: "Choose the closest meaning of “rapid.”", options: ["Careful", "Swift", "Distant", "Quiet"], answer: 1, explanation: "Rapid means fast or swift." },
    { prompt: "Select the grammatically correct sentence.", options: ["She go to class every day.", "She goes to class every day.", "She going to class every day.", "She gone to class every day."], answer: 1, explanation: "A third-person singular subject takes -s in the simple present." },
    { prompt: "Which sentence is punctuated correctly?", options: ["After class we studied, physics.", "After class, we studied physics.", "After, class we studied physics.", "After class we, studied physics."], answer: 1, explanation: "An introductory phrase is followed by a comma." },
    { prompt: "Choose the correct reported speech: He said, “I am ready.”", options: ["He said that he is ready.", "He said that I was ready.", "He said that he was ready.", "He says that he ready."], answer: 2, explanation: "In reported speech, present “am” usually backshifts to “was.”" },
    { prompt: "Choose the correct word: “The student wrote ___ detailed response.”", options: ["a", "an", "the", "no article"], answer: 0, explanation: "“Detailed” starts with a consonant sound, so the correct phrase is “a detailed response.”" },
    { prompt: "Choose the correct tense: “By next June, she ___ the course.”", options: ["completes", "completed", "will have completed", "has completing"], answer: 2, explanation: "The future perfect describes an action completed by a future time." },
    { prompt: "Choose the antonym of “scarce.”", options: ["Rare", "Limited", "Abundant", "Insufficient"], answer: 2, explanation: "Abundant means plentiful, the opposite of scarce." },
    { prompt: "Which word is a conjunction in “I studied, but the exam was postponed”?", options: ["studied", "but", "exam", "postponed"], answer: 1, explanation: "“But” is a coordinating conjunction joining contrasting clauses." },
    { prompt: "Choose the correct sentence.", options: ["Neither answer are correct.", "Neither of the answers is correct.", "Neither answers is correct.", "Neither of answer are correct."], answer: 1, explanation: "“Neither” is singular in standard formal usage, so it takes “is.”" },
    { prompt: "What does the idiom “break the ice” mean?", options: ["Damage something frozen", "Begin a friendly conversation", "End a meeting", "Make a difficult choice"], answer: 1, explanation: "The idiom means to ease social tension or start a conversation." },
    { prompt: "Choose the correct comparative form of “good.”", options: ["Gooder", "More good", "Best", "Better"], answer: 3, explanation: "“Good” has the irregular comparative form “better.”" },
    { prompt: "Which sentence uses a semicolon correctly?", options: ["I was tired; so I slept.", "I was tired; I went to bed early.", "I; was tired and slept.", "I was; tired, I slept."], answer: 1, explanation: "A semicolon can join two closely related independent clauses." },
    { prompt: "Choose the correct relative pronoun: “The student ___ won the prize thanked her teacher.”", options: ["which", "who", "where", "when"], answer: 1, explanation: "“Who” refers to a person acting as the subject of the clause." },
    { prompt: "Which word is closest in meaning to “reluctant”?", options: ["Unwilling", "Excited", "Certain", "Careless"], answer: 0, explanation: "Reluctant means hesitant or unwilling to do something." },
  ],
  Aptitude: [
    { prompt: "What number comes next: 2, 4, 8, 16, …?", options: ["18", "24", "30", "32"], answer: 3, explanation: "Each number is doubled, so 16 × 2 = 32." },
    { prompt: "Which item does not belong: 3, 5, 7, 9, 11?", options: ["3", "7", "9", "11"], answer: 2, explanation: "9 is the only composite number; the others are prime." },
    { prompt: "If all gates are doors and some doors are open, which must be true?", options: ["All gates are open.", "Some gates are open.", "Every gate is a door.", "No doors are gates."], answer: 2, explanation: "The first premise directly states that all gates are doors." },
    { prompt: "A clock shows 3:00. What is the smaller angle between its hands?", options: ["0°", "45°", "90°", "180°"], answer: 2, explanation: "At 3:00 the hands are perpendicular, making a 90° angle." },
    { prompt: "If 5 notebooks cost 100 birr, how much do 3 cost at the same rate?", options: ["40 birr", "50 birr", "60 birr", "80 birr"], answer: 2, explanation: "Each notebook costs 20 birr, so three cost 60 birr." },
    { prompt: "What comes next: 1, 4, 9, 16, …?", options: ["20", "24", "25", "36"], answer: 2, explanation: "These are squares 1², 2², 3², 4²; next is 5² = 25." },
    { prompt: "A shirt costs 200 birr and is discounted by 10%. What is the new price?", options: ["20 birr", "180 birr", "190 birr", "220 birr"], answer: 1, explanation: "Ten percent of 200 is 20; 200 − 20 = 180 birr." },
    { prompt: "If today is Tuesday, what day is it 10 days later?", options: ["Thursday", "Friday", "Saturday", "Sunday"], answer: 1, explanation: "Ten days is one week plus three days; Tuesday + 3 days is Friday." },
    { prompt: "All Lumas are Neris. No Neris are Vatos. Which must be true?", options: ["Some Lumas are Vatos.", "No Lumas are Vatos.", "All Vatos are Lumas.", "Some Neris are Lumas."], answer: 1, explanation: "Since every Luma is a Neri and no Neri is a Vato, no Luma can be a Vato." },
    { prompt: "A number is multiplied by 3 and then 4 is added to get 25. What is the number?", options: ["7", "9", "21", "29"], answer: 0, explanation: "3x + 4 = 25, so 3x = 21 and x = 7." },
    { prompt: "Which number is the odd one out: 8, 27, 64, 100, 125?", options: ["8", "27", "100", "125"], answer: 2, explanation: "8, 27, 64, and 125 are cubes; 100 is not." },
    { prompt: "A meeting begins at 09:35 and lasts 1 hour 50 minutes. When does it end?", options: ["10:25", "11:15", "11:25", "12:25"], answer: 2, explanation: "09:35 + 1 hour = 10:35; plus 50 minutes = 11:25." },
    { prompt: "In a group of 30 learners, 18 study Math. What percent study Math?", options: ["40%", "50%", "60%", "80%"], answer: 2, explanation: "18 ÷ 30 = 0.6, which is 60%." },
    { prompt: "Three people each shake hands with every other person once. How many handshakes occur?", options: ["2", "3", "6", "9"], answer: 1, explanation: "There are 3 pairs of people, so there are 3 handshakes." },
    { prompt: "What is the next letter in the pattern A, C, F, J, …?", options: ["M", "N", "O", "P"], answer: 2, explanation: "The jumps are +2, +3, +4 letters; the next jump is +5, giving O." },
  ],
};

const supernaturalCase = {
  caseId: "the-last-lantern",
  title: "The Last Lantern",
  intro: "At 11:47 p.m., the lights in the old Addis Ababa science archive went out. A lantern is still burning in the sealed east wing. Seven traces lead there; the answers open each door.",
  durationSeconds: 3600,
  focusTotal: 5,
  leads: [
    {
      id: "archive-lock",
      position: 1,
      title: "The Archive Lock",
      scene: "A brass lock is warm to the touch. Chalk on its face reads: “Three times the code, minus five, gives sixteen.” Behind the door, a thin line of gold light cuts across the floor.",
      clue: "A wet footprint points toward the chemistry bench.",
      subject: "Math",
      difficulty: 1,
      prompt: "Solve 3x − 5 = 16.",
      options: ["x = 7", "x = 8", "x = 9", "x = 11"],
      correctAnswerIndex: 0,
      explanation: "Add 5 to get 3x = 21, then divide by 3: x = 7.",
    },
    {
      id: "burner-notebook",
      position: 2,
      title: "The Burner Notebook",
      scene: "A notebook lies beside a cold burner. The last page is covered in a reaction with its coefficients scratched away. The margin smells faintly of smoke.",
      clue: "The water on the bench came from a hydrogen flame.",
      subject: "Chemistry",
      difficulty: 2,
      prompt: "Which coefficients balance H₂ + O₂ → H₂O?",
      options: ["1, 1, 1", "2, 1, 2", "1, 2, 1", "2, 2, 1"],
      correctAnswerIndex: 1,
      explanation: "2H₂ + O₂ → 2H₂O balances four hydrogen atoms and two oxygen atoms.",
    },
    {
      id: "chalk-roots",
      position: 3,
      title: "Roots on the Board",
      scene: "A blackboard squeaks although nobody is near it. Two roots circle the equation x² − 7x + 12 = 0; one has been wiped away.",
      clue: "Both roots add to seven and multiply to twelve.",
      subject: "Math",
      difficulty: 2,
      prompt: "What are the roots of x² − 7x + 12 = 0?",
      options: ["2 and 6", "3 and 4", "−3 and −4", "1 and 12"],
      correctAnswerIndex: 1,
      explanation: "Factor the expression as (x − 3)(x − 4) = 0, so x = 3 or x = 4.",
    },
    {
      id: "silver-beaker",
      position: 4,
      title: "The Silver Beaker",
      scene: "A beaker has a silver film inside. Its label reads 0.20 mol/L, but a second note says only half a litre was prepared.",
      clue: "The mixture contains one tenth of a mole of dissolved salt.",
      subject: "Chemistry",
      difficulty: 2,
      prompt: "How many moles of solute are in 0.50 L of a 0.20 mol/L solution?",
      options: ["0.01 mol", "0.10 mol", "0.25 mol", "2.50 mol"],
      correctAnswerIndex: 1,
      explanation: "n = cV = 0.20 mol/L × 0.50 L = 0.10 mol.",
    },
    {
      id: "stairwell-shadow",
      position: 5,
      title: "The Stairwell Shadow",
      scene: "A shadow climbs the stairwell against the direction of the light. A strip of paper on the wall shows d(x³ − 2x)/dx.",
      clue: "At x = 2, the shadow's rate of change is ten.",
      subject: "Math",
      difficulty: 3,
      prompt: "Evaluate the derivative of x³ − 2x at x = 2.",
      options: ["6", "8", "10", "12"],
      correctAnswerIndex: 2,
      explanation: "The derivative is 3x² − 2. At x = 2 it is 3(4) − 2 = 10.",
    },
    {
      id: "equilibrium-glass",
      position: 6,
      title: "The Equilibrium Glass",
      scene: "A cracked glass tube holds a violet vapour. A reaction card identifies nitrogen, hydrogen, and ammonia. The tube vibrates whenever the archive clock ticks.",
      clue: "The unseen force is gathering where the violet vapour is most concentrated.",
      subject: "Chemistry",
      difficulty: 4,
      prompt: "For N₂(g) + 3H₂(g) ⇌ 2NH₃(g), which expression gives Kc?",
      options: ["[N₂][H₂]³ / [NH₃]²", "[NH₃]² / ([N₂][H₂]³)", "[NH₃] / ([N₂][H₂])", "[N₂] + 3[H₂] / 2[NH₃]"],
      correctAnswerIndex: 1,
      explanation: "Products go in the numerator and reactants in the denominator, each raised to its coefficient.",
    },
    {
      id: "east-wing-map",
      position: 7,
      title: "The East-Wing Map",
      scene: "The final trace is a map of the east wing. Three marks form a triangle around the lantern room. Under the map: “The door opens where the line meets the axis.”",
      clue: "The lantern is inside the sealed room; the reaction on its door is N₂ + 3H₂ → 2NH₃.",
      subject: "Math",
      difficulty: 4,
      prompt: "Find the x-intercepts of y = x² − 5x + 6.",
      options: ["x = 1 and 6", "x = −2 and −3", "x = 2 and 3", "x = 0 and 6"],
      correctAnswerIndex: 2,
      explanation: "Factor as (x − 2)(x − 3) = 0; the graph crosses the x-axis at 2 and 3.",
    },
  ],
  monsterName: "The Ashen Wraith",
  monsterHp: 100,
  finaleSteps: [
    {
      id: "wraith-limiting-reagent",
      title: "Break the First Seal",
      scene: "The Wraith rises around the lantern. A reaction burns across its chest: N₂ + 3H₂ → 2NH₃. Four moles of nitrogen and nine moles of hydrogen remain.",
      subject: "Chemistry",
      difficulty: 4,
      prompt: "Which reactant is limiting?",
      options: ["N₂", "H₂", "NH₃", "Neither; they are in exact proportion"],
      correctAnswerIndex: 1,
      explanation: "Four moles of N₂ need 12 moles of H₂. Only 9 moles are present, so H₂ is limiting.",
      hpDamage: 30,
    },
    {
      id: "wraith-theoretical-yield",
      title: "Break the Second Seal",
      scene: "The first seal cracks. The Wraith recoils as the remaining hydrogen begins to react.",
      subject: "Chemistry",
      difficulty: 5,
      prompt: "How many moles of NH₃ can form from 9 mol H₂ when N₂ is in excess?",
      options: ["3 mol", "6 mol", "9 mol", "18 mol"],
      correctAnswerIndex: 1,
      explanation: "The mole ratio is 3 mol H₂ : 2 mol NH₃, so 9 mol H₂ produces 6 mol NH₃.",
      hpDamage: 30,
    },
    {
      id: "wraith-percent-yield",
      title: "Break the Final Seal",
      scene: "The lantern flares. The Wraith's last shield weakens; the notebook says the experiment collected 4.5 mol NH₃.",
      subject: "Math",
      difficulty: 5,
      prompt: "If the theoretical yield is 6 mol and the actual yield is 4.5 mol, what is the percentage yield?",
      options: ["25%", "50%", "75%", "133.3%"],
      correctAnswerIndex: 2,
      explanation: "Percentage yield = (actual ÷ theoretical) × 100 = (4.5 ÷ 6) × 100 = 75%.",
      hpDamage: 40,
    },
  ],
  rewardXp: 500,
  rewardBadge: "Lantern Keeper",
  rewardTitle: "Warden of the Unseen",
  active: true,
};

export async function seedNexoraData(): Promise<void> {
  const samplePasswordHash = await bcrypt.hash("NexoraDemo!2026", 10);
  for (const [email, name, role] of [
    ["student@nexora.demo", "Demo Student", "student"],
    ["teacher@nexora.demo", "Demo Teacher", "teacher"],
    ["admin@nexora.demo", "Demo Admin", "admin"],
  ]) {
    await UserModel.updateOne(
      { email },
      { $setOnInsert: { email, name, role, passwordHash: samplePasswordHash, grade: 12, school: "Nexora Demo School" } },
      { upsert: true },
    );
  }

  for (const [subject, questions] of Object.entries(sampleQuestions)) {
    const operations = questions.flatMap((question, index) =>
      ranks.map((rank, rankIndex) => ({
        updateOne: {
          filter: { subject, rank, prompt: question.prompt },
          update: {
            $setOnInsert: {
              ...question,
              subject,
              rank,
              difficulty: rankIndex + 1 + (index % 2),
              correctAnswerIndex: question.answer,
            },
          },
          upsert: true,
        },
      })),
    );
    await QuestionModel.bulkWrite(operations, { ordered: false });
    await SubjectModel.updateOne(
      { name: subject },
      { $set: { questionCount: await QuestionModel.countDocuments({ subject }) } },
      { upsert: true },
    );
  }
  await EventCaseModel.updateOne(
    { caseId: supernaturalCase.caseId },
    { $set: supernaturalCase },
    { upsert: true },
  );

  const teacher = await UserModel.findOne({ email: "teacher@nexora.demo" });
  if (teacher) {
    await TournamentModel.updateOne(
      { name: "Friday Focus Arena" },
      {
        $setOnInsert: { name: "Friday Focus Arena", subject: "Math", paid: false, entryFeeEtb: 0 },
        $set: { startsAt: new Date(Date.now() - 60_000), roundRanks: ["E", "C", "A"], roundDurationSeconds: 300, capacity: 64, active: true },
      },
      { upsert: true },
    );
    await TournamentModel.updateOne(
      { name: "Golden Gate Trials" },
      {
        $setOnInsert: { name: "Golden Gate Trials", subject: "Physics", paid: true, entryFeeEtb: 50 },
        $set: { startsAt: new Date(Date.now() - 60_000), roundRanks: ["E", "C", "A"], roundDurationSeconds: 300, capacity: 64, active: true },
      },
      { upsert: true },
    );
  }
  logger.info({ subjects: Object.keys(sampleQuestions).length, questionsPerSubject: 90 }, "Nexora sample content ready");
}
