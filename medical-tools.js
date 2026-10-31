/* Educational terms and public resources. This is not a diagnostic database. */
(function (window) {
  'use strict';

  const resource = (name, description, url) => ({ name, description, url });
  const medline = slug => resource('MedlinePlus condition information', 'Patient information from the U.S. National Library of Medicine.', `https://medlineplus.gov/${slug}.html`);
  const nord = resource('NORD rare disease resources', 'Condition information and support resources; not a local clinician directory.', 'https://rarediseases.org/');
  const condition = (id, name, aliases, specialties, summary, resources) => ({ id, name, aliases, specialties, summary, resources });
  const conditions = [
    condition('eds', 'Ehlers-Danlos syndrome', ['ehlers danlos', 'eds'], ['clinical genetics', 'rheumatology', 'physical medicine'], 'A group of conditions affecting connective tissue, including joints and skin.', [resource('The Ehlers-Danlos Society', 'Public directory of professionals with an interest in EDS and HSD. Entries are not a guarantee of expertise.', 'https://www.ehlers-danlos.com/healthcare-professionals-directory/'), medline('ehlersdanlossyndrome')]),
    condition('pots', 'POTS / dysautonomia', ['pots', 'p o t s', 'dysautonomia', 'postural orthostatic tachycardia syndrome'], ['cardiology', 'neurology', 'autonomic disorders'], 'POTS involves an excessive rise in heart rate when standing, with symptoms; dysautonomia affects automatic body functions.', [resource('Dysautonomia International', 'Physician resources for POTS and other forms of dysautonomia.', 'https://www.dysautonomiainternational.org/page.php?ID=14')]),
    condition('mecfs', 'ME/CFS', ['me cfs', 'm e c f s', 'chronic fatigue syndrome', 'myalgic encephalomyelitis'], ['primary care', 'ME/CFS care', 'rehabilitation medicine'], 'An illness often involving worsening symptoms after activity, unrefreshing sleep, and reduced ability to carry out everyday activities.', [resource('Solve M.E.', 'ME/CFS information, support, and research resources.', 'https://solvecfs.org/'), medline('chronicfatiguesyndrome')]),
    condition('fibromyalgia', 'Fibromyalgia', ['fibromyalgia'], ['rheumatology', 'pain medicine', 'primary care'], 'A condition involving widespread pain, sleep difficulties, and fatigue.', [medline('fibromyalgia')]),
    condition('longcovid', 'Long COVID', ['long covid', 'post covid', 'post covid condition'], ['primary care', 'post-COVID care', 'rehabilitation medicine'], 'Symptoms that continue or develop after a COVID-19 infection.', [resource('CDC Long COVID information', 'Symptoms, care information, and resources for people with Long COVID.', 'https://www.cdc.gov/long-covid/'), medline('longcovid')]),
    condition('diabetes', 'Diabetes', ['diabetes', 'diabetic', 'type 1 diabetes', 'type 2 diabetes'], ['endocrinology', 'primary care', 'diabetes education'], 'Conditions involving blood sugar levels that are too high.', [resource('American Diabetes Association', 'Diabetes education and support resources.', 'https://diabetes.org/'), medline('diabetes')]),
    condition('asthma', 'Asthma', ['asthma'], ['pulmonology', 'allergy and immunology'], 'A condition in which the airways become inflamed and narrow at times.', [resource('Asthma and Allergy Foundation of America', 'Education and support for asthma and allergies.', 'https://aafa.org/'), medline('asthma')]),
    condition('copd', 'COPD', ['copd', 'chronic obstructive pulmonary disease', 'emphysema'], ['pulmonology', 'primary care'], 'A group of lung diseases that cause ongoing breathing difficulty.', [resource('COPD Foundation', 'Patient education, community, and care resources.', 'https://www.copdfoundation.org/'), medline('copd')]),
    condition('migraine', 'Migraine', ['migraine', 'migraines'], ['neurology', 'headache medicine'], 'A neurological condition that can include headache, nausea, and sensitivity to light or sound.', [resource('American Migraine Foundation', 'Migraine education and headache specialist resources.', 'https://americanmigrainefoundation.org/'), medline('migraine')]),
    condition('arthritis', 'Osteoarthritis', ['osteoarthritis', 'degenerative joint disease'], ['rheumatology', 'orthopedics', 'physical therapy'], 'A joint condition involving changes to cartilage and other joint tissues.', [resource('Arthritis Foundation', 'Arthritis information, support, and care resources.', 'https://www.arthritis.org/'), medline('osteoarthritis')]),
    condition('ra', 'Rheumatoid arthritis', ['rheumatoid arthritis'], ['rheumatology'], 'An autoimmune condition in which the immune system causes joint inflammation.', [resource('Arthritis Foundation', 'Rheumatoid arthritis education and support.', 'https://www.arthritis.org/'), medline('rheumatoidarthritis')]),
    condition('lupus', 'Lupus', ['lupus', 'sle', 'systemic lupus erythematosus'], ['rheumatology'], 'An autoimmune condition that can affect joints, skin, and other organs.', [resource('Lupus Foundation of America', 'Patient information and support resources.', 'https://www.lupus.org/'), medline('lupus')]),
    condition('crohns', 'Crohn’s disease', ['crohn', 'crohns', 'crohn s', 'crohns disease'], ['gastroenterology'], 'A type of inflammatory bowel disease that can affect parts of the digestive tract.', [resource('Crohn’s & Colitis Foundation', 'Inflammatory bowel disease education and support.', 'https://www.crohnscolitisfoundation.org/'), medline('crohnsdisease')]),
    condition('uc', 'Ulcerative colitis', ['ulcerative colitis'], ['gastroenterology'], 'A type of inflammatory bowel disease affecting the inner lining of the large intestine.', [resource('Crohn’s & Colitis Foundation', 'IBD education and resources for finding care.', 'https://www.crohnscolitisfoundation.org/'), medline('ulcerativecolitis')]),
    condition('ibs', 'Irritable bowel syndrome', ['ibs', 'irritable bowel syndrome'], ['gastroenterology', 'primary care'], 'A condition causing recurring abdominal pain and changes in bowel movements.', [medline('irritablebowelsyndrome')]),
    condition('celiac', 'Celiac disease', ['celiac', 'coeliac'], ['gastroenterology', 'registered dietitian'], 'An immune reaction to gluten that damages the small intestine.', [resource('Celiac Disease Foundation', 'Celiac education and healthcare resources.', 'https://celiac.org/'), medline('celiacdisease')]),
    condition('thyroid', 'Thyroid disorders', ['thyroid', 'hypothyroidism', 'hyperthyroidism', 'hashimoto', 'graves disease'], ['endocrinology', 'primary care'], 'Conditions affecting the gland that helps regulate many body functions.', [resource('American Thyroid Association', 'Thyroid information and physician resources.', 'https://www.thyroid.org/'), medline('thyroiddiseases')]),
    condition('hypertension', 'High blood pressure', ['hypertension', 'high blood pressure'], ['primary care', 'cardiology'], 'Blood pressure that remains higher than recommended for a person’s circumstances.', [resource('American Heart Association', 'Heart and blood pressure education.', 'https://www.heart.org/'), medline('highbloodpressure')]),
    condition('heart', 'Heart disease', ['heart disease', 'coronary artery disease', 'cad'], ['cardiology', 'primary care'], 'Conditions affecting the heart and its blood supply.', [resource('American Heart Association', 'Heart disease education and care resources.', 'https://www.heart.org/'), medline('heartdiseases')]),
    condition('afib', 'Atrial fibrillation', ['atrial fibrillation', 'afib', 'a fib'], ['cardiology', 'cardiac electrophysiology'], 'An irregular heart rhythm that may require assessment and treatment.', [resource('American Heart Association', 'Information about heart rhythm conditions.', 'https://www.heart.org/'), medline('atrialfibrillation')]),
    condition('stroke', 'Stroke recovery', ['stroke', 'tia', 'transient ischemic attack'], ['neurology', 'rehabilitation medicine'], 'Care and rehabilitation after an interruption of blood supply to part of the brain.', [resource('American Stroke Association', 'Stroke recovery and support resources.', 'https://www.stroke.org/'), medline('stroke')]),
    condition('epilepsy', 'Epilepsy', ['epilepsy', 'seizure disorder'], ['neurology', 'epileptology'], 'A condition involving recurring seizures.', [resource('Epilepsy Foundation', 'Epilepsy education and specialist care resources.', 'https://www.epilepsy.com/'), medline('epilepsy')]),
    condition('ms', 'Multiple sclerosis', ['multiple sclerosis'], ['neurology'], 'A condition affecting nerve signaling in the brain and spinal cord.', [resource('National Multiple Sclerosis Society', 'MS care and support resources.', 'https://www.nationalmssociety.org/'), medline('multiplesclerosis')]),
    condition('parkinsons', 'Parkinson’s disease', ['parkinson', 'parkinsons', 'parkinson s'], ['neurology', 'movement disorders'], 'A neurological condition that often affects movement and may have other symptoms.', [resource('Parkinson’s Foundation', 'Patient information and care resources.', 'https://www.parkinson.org/'), medline('parkinsonsdisease')]),
    condition('kidney', 'Chronic kidney disease', ['chronic kidney disease', 'ckd', 'kidney disease'], ['nephrology', 'primary care'], 'A condition in which kidney damage or reduced kidney function persists over time.', [resource('National Kidney Foundation', 'Kidney disease information and care resources.', 'https://www.kidney.org/'), medline('chronickidneydisease')]),
    condition('endometriosis', 'Endometriosis', ['endometriosis'], ['gynecology', 'pelvic pain care'], 'A condition involving tissue similar to the uterine lining growing outside the uterus.', [resource('Endometriosis Foundation of America', 'Patient education and support resources.', 'https://www.endofound.org/'), medline('endometriosis')]),
    condition('pcos', 'PCOS', ['pcos', 'polycystic ovary syndrome'], ['gynecology', 'endocrinology'], 'A hormone-related condition that can affect menstrual cycles and other aspects of health.', [medline('polycysticovarysyndrome')]),
    condition('mcas', 'Mast cell disorders', ['mcas', 'mast cell', 'mastocytosis'], ['allergy and immunology', 'hematology'], 'Conditions involving mast cells, which are part of the immune system.', [resource('The Mast Cell Disease Society', 'Patient information, support, and care resources.', 'https://tmsforacure.org/'), nord]),
    condition('allergy', 'Allergies', ['allergies', 'allergy', 'allergic'], ['allergy and immunology'], 'Immune reactions to substances that are usually harmless to many people.', [resource('American Academy of Allergy, Asthma & Immunology', 'Allergy information and allergist resources.', 'https://www.aaaai.org/'), medline('allergy')]),
    condition('eczema', 'Eczema / atopic dermatitis', ['eczema', 'atopic dermatitis'], ['dermatology', 'allergy and immunology'], 'An inflammatory skin condition that can cause itchy, dry skin.', [resource('National Eczema Association', 'Eczema education and support.', 'https://nationaleczema.org/'), medline('eczema')]),
    condition('psoriasis', 'Psoriasis', ['psoriasis', 'psoriatic arthritis'], ['dermatology', 'rheumatology'], 'An immune-related condition that affects skin and sometimes joints.', [resource('National Psoriasis Foundation', 'Psoriasis and psoriatic arthritis care resources.', 'https://www.psoriasis.org/'), medline('psoriasis')]),
    condition('sleep', 'Sleep apnea', ['sleep apnea', 'sleep apnoea', 'osa'], ['sleep medicine', 'pulmonology'], 'A condition in which breathing repeatedly stops or becomes shallow during sleep.', [medline('sleepapnea')]),
    condition('anemia', 'Anemia', ['anemia', 'anaemia', 'iron deficiency'], ['primary care', 'hematology'], 'A lower-than-expected amount of healthy red blood cells or hemoglobin.', [medline('anemia')]),
    condition('cancer', 'Cancer care', ['cancer', 'oncology', 'tumor', 'tumour', 'carcinoma'], ['oncology', 'specialty-specific cancer care'], 'Care for cancer depends on its type, location, and other clinical details.', [resource('National Cancer Institute', 'Cancer information and help finding cancer care.', 'https://www.cancer.gov/'), resource('American Cancer Society', 'Cancer education, support, and care navigation.', 'https://www.cancer.org/')]),
    condition('anxiety', 'Anxiety disorders', ['anxiety', 'panic disorder', 'panic attack'], ['psychology', 'psychiatry', 'primary care'], 'Conditions involving persistent anxiety or fear that affects daily life.', [resource('Anxiety & Depression Association of America', 'Mental health information and therapist resources.', 'https://adaa.org/'), medline('anxiety')]),
    condition('depression', 'Depression', ['depression', 'depressive disorder'], ['psychology', 'psychiatry', 'primary care'], 'A mood condition that can affect energy, sleep, motivation, and daily activities.', [resource('NAMI', 'Mental health education and support.', 'https://www.nami.org/'), medline('depression')]),
    condition('adhd', 'ADHD', ['adhd', 'attention deficit hyperactivity disorder'], ['psychiatry', 'psychology', 'primary care'], 'A condition that can affect attention, impulsivity, and activity levels.', [resource('CHADD', 'ADHD education and professional resources.', 'https://chadd.org/'), medline('attentiondeficithyperactivitydisorder')]),
    condition('autism', 'Autism', ['autism', 'autistic', 'autism spectrum'], ['developmental pediatrics', 'psychology', 'primary care'], 'A neurodevelopmental difference affecting communication, sensory experiences, and other aspects of life.', [resource('Autistic Self Advocacy Network', 'Resources and advocacy led by autistic people.', 'https://autisticadvocacy.org/'), medline('autismspectrumdisorder')]),
    condition('ptsd', 'PTSD', ['ptsd', 'post traumatic stress', 'posttraumatic stress'], ['psychology', 'psychiatry'], 'A condition that can develop after experiencing or witnessing trauma.', [resource('National Center for PTSD', 'Trauma and PTSD education and support resources.', 'https://www.ptsd.va.gov/'), medline('posttraumaticstressdisorder')]),
    condition('bipolar', 'Bipolar disorder', ['bipolar', 'bipolar disorder'], ['psychiatry', 'psychology'], 'A mood condition involving episodes of unusually elevated or irritable mood and, often, depression.', [resource('NAMI', 'Mental health education and support.', 'https://www.nami.org/'), medline('bipolardisorder')]),
    condition('osteoporosis', 'Osteoporosis', ['osteoporosis'], ['endocrinology', 'rheumatology', 'primary care'], 'A condition involving reduced bone strength and increased fracture risk.', [resource('Bone Health & Osteoporosis Foundation', 'Bone health information and support.', 'https://www.bonehealthandosteoporosis.org/'), medline('osteoporosis')]),
    condition('gerd', 'GERD / acid reflux', ['gerd', 'acid reflux', 'gastroesophageal reflux'], ['gastroenterology', 'primary care'], 'A condition involving stomach contents flowing back into the esophagus.', [medline('gerd')]),
    condition('chronicpain', 'Chronic pain', ['chronic pain', 'persistent pain', 'crps', 'complex regional pain syndrome'], ['pain medicine', 'physical medicine', 'primary care'], 'Pain that persists or recurs over a long period; care depends on its cause and impact.', [resource('American Chronic Pain Association', 'Pain education and peer support resources.', 'https://www.acpanow.com/'), medline('chronicpain')]),
    condition('hsd', 'Hypermobility spectrum disorder', ['hsd', 'hypermobile spectrum disorder', 'hypermobility spectrum disorder'], ['rheumatology', 'physical medicine', 'physical therapy'], 'Conditions involving symptomatic joint hypermobility. HSD and Ehlers-Danlos syndrome are distinct diagnoses.', [resource('The Ehlers-Danlos Society', 'Information and professional resources for HSD and EDS; a clinician can distinguish the diagnoses.', 'https://www.ehlers-danlos.com/healthcare-professionals-directory/')]),
    condition('ibd', 'Inflammatory bowel disease', ['ibd', 'inflammatory bowel disease'], ['gastroenterology'], 'An umbrella term for conditions including Crohn’s disease and ulcerative colitis; the specific type matters for care.', [resource('Crohn’s & Colitis Foundation', 'Information about different types of IBD and resources for finding care.', 'https://www.crohnscolitisfoundation.org/')]),
    condition('osteopenia', 'Osteopenia', ['osteopenia', 'low bone density'], ['primary care', 'endocrinology'], 'Bone density lower than expected, but less reduced than in osteoporosis. Your clinician can assess your fracture risk.', [resource('Bone Health & Osteoporosis Foundation', 'Bone density information and support.', 'https://www.bonehealthandosteoporosis.org/'), medline('bonedensity')]),
    condition('arthritis-general', 'Arthritis (type unspecified)', ['arthritis'], ['primary care', 'rheumatology'], 'Arthritis refers to several different joint conditions. A clinician can help determine the type before a more specific referral.', [resource('Arthritis Foundation', 'Information about different types of arthritis and support resources.', 'https://www.arthritis.org/'), medline('arthritis')]),
    condition('other', 'Other / exploring a diagnosis', ['other', 'undiagnosed', 'exploring a diagnosis', 'rare disease'], ['primary care', 'condition-specific care after assessment'], 'A primary care clinician can help organize symptoms and decide which referrals may be appropriate.', [nord, resource('MedlinePlus health topics', 'Browse reliable patient information across a broad range of conditions.', 'https://medlineplus.gov/healthtopics.html')])
  ];

  // Aliases are matched as complete words so, for example, "MS" is not found
  // inside "symptoms". Definitions describe terms, not a patient's diagnosis.
  const glossary = [
    ['tachycardia', 'A faster-than-usual heart rate.'],
    ['bradycardia', 'A slower-than-usual heart rate.'],
    ['orthostatic intolerance', 'Symptoms such as dizziness when standing upright.'],
    ['orthostatic hypotension', 'A drop in blood pressure after standing up.'],
    ['hemoglobin', 'A protein in red blood cells that carries oxygen.', ['haemoglobin', 'hgb', 'hb']],
    ['hematocrit', 'The proportion of your blood made up of red blood cells.', ['haematocrit', 'hct']],
    ['anemia', 'A lower-than-expected amount of healthy red blood cells or hemoglobin.', ['anaemia']],
    ['hypertension', 'High blood pressure.'],
    ['hypotension', 'Low blood pressure.'],
    ['benign', 'Usually means a finding is not cancerous. Its meaning depends on context.'],
    ['malignant', 'A term often used for cancerous cells or growths; the full report matters.'],
    ['edema', 'Swelling caused by fluid collecting in the tissues.', ['oedema']],
    ['dysautonomia', 'Conditions that affect automatic body functions, such as heart rate and blood pressure.'],
    ['chronic', 'Lasting a long time or repeatedly coming back.'],
    ['acute', 'Starting suddenly or lasting a relatively short time; it does not automatically mean severe.'],
    ['potassium', 'A mineral that helps your nerves, muscles, and heart work.', ['k+']],
    ['sodium', 'A mineral involved in fluid balance and nerve and muscle function.', ['na+']],
    ['calcium', 'A mineral needed for bones, muscles, nerves, and other body functions.'],
    ['magnesium', 'A mineral involved in many muscle, nerve, and metabolic functions.'],
    ['glucose', 'A type of sugar your body uses for energy.', ['blood sugar']],
    ['creatinine', 'A waste product measured to help assess kidney function.'],
    ['fatigue', 'Tiredness or lack of energy that can affect everyday activities.'],
    ['POTS', 'POTS stands for postural orthostatic tachycardia syndrome: an excessive rise in heart rate when standing, along with symptoms.', ['postural orthostatic tachycardia syndrome']],
    ['ME/CFS', 'Myalgic encephalomyelitis/chronic fatigue syndrome, an illness often involving worsening symptoms after activity.', ['me cfs', 'chronic fatigue syndrome', 'myalgic encephalomyelitis']],
    ['Ehlers-Danlos syndrome', 'A group of conditions that affect connective tissue, such as the tissue supporting joints and skin.', ['ehlers danlos syndrome', 'eds']],
    ['fibromyalgia', 'A condition involving widespread pain, fatigue, and sleep difficulties.'],
    ['long COVID', 'Symptoms that continue or develop after a COVID-19 infection.', ['post covid condition']],
    ['post-exertional malaise', 'A worsening of symptoms after physical, mental, or emotional activity.', ['pem']],
    ['syncope', 'Fainting: a brief loss of consciousness.'],
    ['presyncope', 'Feeling as though you might faint without fully losing consciousness.'],
    ['palpitations', 'Feeling that your heart is pounding, racing, fluttering, or skipping beats.'],
    ['arrhythmia', 'An abnormal pattern or rhythm of the heartbeat.'],
    ['atrial fibrillation', 'An irregular heart rhythm that begins in the upper chambers of the heart.', ['afib', 'a fib']],
    ['dyspnea', 'Difficulty breathing or shortness of breath.', ['dyspnoea', 'sob']],
    ['hypoxia', 'Less oxygen reaching the tissues than they need.'],
    ['oxygen saturation', 'An estimate of how much oxygen is carried in the blood.', ['spo2']],
    ['cyanosis', 'A bluish or grayish change in skin or lips that can be related to low oxygen.'],
    ['chest pain', 'Pain or discomfort in the chest; its cause and urgency need clinical assessment.'],
    ['blood pressure', 'The force of blood against artery walls.', ['bp']],
    ['heart rate', 'The number of times the heart beats in one minute.', ['hr', 'pulse']],
    ['respiratory rate', 'The number of breaths taken in one minute.', ['rr']],
    ['systolic', 'The top blood pressure number: pressure when the heart pumps.'],
    ['diastolic', 'The bottom blood pressure number: pressure between heartbeats.'],
    ['ECG / EKG', 'A test that records the heart’s electrical activity.', ['ecg', 'ekg', 'electrocardiogram']],
    ['echocardiogram', 'An ultrasound test that produces pictures of the heart.', ['echo']],
    ['ejection fraction', 'The proportion of blood pumped out of a heart chamber with each beat.'],
    ['troponin', 'A protein measured in blood when clinicians assess possible heart muscle injury.'],
    ['BNP', 'A blood marker that can help clinicians assess strain on the heart.', ['bnp', 'nt probnp']],
    ['CBC', 'Complete blood count: a group of tests measuring different blood cells.', ['cbc', 'complete blood count']],
    ['CMP', 'Comprehensive metabolic panel: blood tests of chemicals related to several body functions.', ['cmp', 'comprehensive metabolic panel']],
    ['BMP', 'Basic metabolic panel: blood tests including electrolytes, glucose, and kidney markers.', ['bmp', 'basic metabolic panel']],
    ['white blood cells', 'Cells that are part of your immune system.', ['wbc', 'leukocytes']],
    ['red blood cells', 'Cells that carry oxygen around the body.', ['rbc', 'erythrocytes']],
    ['platelets', 'Blood cell fragments that help stop bleeding by forming clots.', ['plt', 'thrombocytes']],
    ['neutrophils', 'White blood cells that help fight some infections.'],
    ['lymphocytes', 'White blood cells involved in immune responses.'],
    ['eosinophils', 'White blood cells that can be involved in allergies and responses to parasites.'],
    ['ferritin', 'A protein that stores iron; its blood level helps assess iron stores.'],
    ['iron deficiency', 'A lack of enough iron for the body’s needs.'],
    ['MCV', 'Mean corpuscular volume: the average size of your red blood cells.', ['mcv', 'mean corpuscular volume']],
    ['B12', 'A vitamin needed for nerves and blood cell production.', ['b12', 'vitamin b 12', 'cobalamin']],
    ['folate', 'A B vitamin involved in making new cells.', ['folic acid']],
    ['vitamin D', 'A vitamin involved in bone health and other body functions.', ['vitamin d']],
    ['A1C', 'A blood test that reflects average blood sugar over about the previous two to three months.', ['a1c', 'hba1c', 'glycated hemoglobin']],
    ['diabetes', 'Conditions involving blood sugar levels that are too high.'],
    ['hyperglycemia', 'High blood sugar.', ['hyperglycaemia']],
    ['hypoglycemia', 'Low blood sugar.', ['hypoglycaemia']],
    ['lipid panel', 'Blood tests measuring cholesterol and fats in the blood.'],
    ['cholesterol', 'A fatty substance the body needs, but certain blood patterns can affect heart risk.'],
    ['LDL', 'A type of cholesterol-carrying particle; its level is assessed alongside other heart risk factors.', ['ldl']],
    ['HDL', 'A type of cholesterol-carrying particle involved in moving cholesterol through the body.', ['hdl']],
    ['triglycerides', 'A type of fat measured in the blood.'],
    ['eGFR', 'An estimate of how well the kidneys filter blood.', ['egfr', 'estimated glomerular filtration rate']],
    ['BUN', 'Blood urea nitrogen: a waste-related blood measurement used with other kidney tests.', ['bun', 'blood urea nitrogen']],
    ['proteinuria', 'Protein found in the urine.'],
    ['hematuria', 'Blood found in the urine.', ['haematuria']],
    ['albumin', 'A protein made by the liver that helps keep fluid in blood vessels.'],
    ['bilirubin', 'A substance produced as old red blood cells break down.'],
    ['ALT', 'A liver-related enzyme measured in blood; interpretation depends on context.', ['alt', 'alanine aminotransferase']],
    ['AST', 'An enzyme present in the liver and other tissues; a blood result needs context.', ['ast', 'aspartate aminotransferase']],
    ['alkaline phosphatase', 'An enzyme related to several tissues, including liver and bone.', ['alp']],
    ['TSH', 'Thyroid-stimulating hormone: a signal that helps control thyroid activity.', ['tsh', 'thyroid stimulating hormone']],
    ['T4', 'A hormone made by the thyroid gland.', ['t4', 'thyroxine']],
    ['T3', 'An active thyroid hormone.', ['t3', 'triiodothyronine']],
    ['hypothyroidism', 'An underactive thyroid gland.'],
    ['hyperthyroidism', 'An overactive thyroid gland.'],
    ['CRP', 'C-reactive protein: a blood marker of inflammation.', ['crp', 'c reactive protein']],
    ['ESR', 'Erythrocyte sedimentation rate: a blood test that can reflect inflammation.', ['esr', 'sed rate']],
    ['ANA', 'Antinuclear antibodies: an immune-system blood test; a positive result alone does not establish a diagnosis.', ['ana', 'antinuclear antibodies']],
    ['inflammation', 'An immune response that can cause swelling, warmth, pain, or other changes.'],
    ['autoimmune', 'Related to the immune system reacting against the body’s own tissues.'],
    ['immunosuppression', 'Reduced activity of the immune system.'],
    ['neuropathy', 'Damage or dysfunction of nerves, often causing altered sensation or weakness.'],
    ['paresthesia', 'An unusual sensation such as tingling or pins and needles.', ['paraesthesia']],
    ['myalgia', 'Muscle pain.'],
    ['arthralgia', 'Joint pain.'],
    ['hypermobility', 'Joints moving beyond the usual range of motion.'],
    ['subluxation', 'A joint moving partly out of its usual position.'],
    ['dislocation', 'A joint moving fully out of its usual position.'],
    ['osteoporosis', 'Reduced bone strength that raises the chance of fractures.'],
    ['osteopenia', 'Bone density lower than expected, but less reduced than in osteoporosis.'],
    ['stenosis', 'Narrowing of a passage or opening in the body.'],
    ['scoliosis', 'A sideways curve in the spine.'],
    ['radiculopathy', 'Symptoms caused by irritation or compression of a spinal nerve root.'],
    ['lesion', 'An area of tissue that looks different or is damaged; the term does not itself mean cancer.'],
    ['nodule', 'A small lump or area of tissue; its significance depends on where it is and its features.'],
    ['cyst', 'A sac-like area that may contain fluid or other material.'],
    ['biopsy', 'Taking a small tissue sample so it can be examined.'],
    ['pathology', 'The study or examination of tissue and disease-related changes.'],
    ['MRI', 'A scan that uses magnets and radio waves to make detailed pictures.', ['mri', 'magnetic resonance imaging']],
    ['CT scan', 'A scan using X-rays to make detailed cross-sectional pictures.', ['ct', 'computed tomography']],
    ['ultrasound', 'A test using sound waves to create images inside the body.', ['sonogram']],
    ['X-ray', 'An imaging test using a small amount of radiation.', ['x ray', 'xray']],
    ['contrast', 'A substance sometimes used to make structures easier to see on scans.'],
    ['unremarkable', 'The report did not describe a concerning or unusual finding in that area.'],
    ['within normal limits', 'The finding falls within the range considered usual by that report.', ['wnl']],
    ['no acute findings', 'The report did not identify a new or sudden abnormality in the area examined.', ['no acute abnormality', 'no acute abnormalities']],
    ['negative', 'The test or finding being checked was not detected; the meaning depends on the test.'],
    ['positive', 'The test or finding being checked was detected; this alone may not establish a diagnosis.'],
    ['differential diagnosis', 'The list of possible explanations a clinician is considering.'],
    ['idiopathic', 'The cause is not known.'],
    ['etiology', 'The cause or origin of a condition.', ['aetiology']],
    ['prognosis', 'The expected course of a condition, with uncertainty.'],
    ['remission', 'A period when signs or symptoms of a condition are reduced or absent.'],
    ['exacerbation', 'A worsening or flare of symptoms.'],
    ['comorbidity', 'An additional condition present alongside another condition.'],
    ['contraindication', 'A reason a treatment or procedure may be unsuitable or unsafe.'],
    ['adverse effect', 'An unwanted effect from a treatment or other intervention.', ['side effect']],
    ['PRN', 'As needed. Ask the prescriber for the exact limits and instructions.', ['prn']],
    ['BID', 'Twice a day in medical shorthand; verify the actual prescription instructions.', ['bid']],
    ['TID', 'Three times a day in medical shorthand; verify the actual prescription instructions.', ['tid']],
    ['QID', 'Four times a day in medical shorthand; verify the actual prescription instructions.', ['qid']],
    ['PO', 'By mouth in medical shorthand.', ['po']],
    ['NPO', 'Nothing by mouth, when used in preparation instructions; follow the clinician’s exact guidance.', ['npo']],
    ['GERD', 'Gastroesophageal reflux disease: stomach contents repeatedly flowing back into the esophagus.', ['gerd', 'gastroesophageal reflux disease']],
    ['IBS', 'Irritable bowel syndrome: recurring abdominal pain with changes in bowel movements.', ['ibs', 'irritable bowel syndrome']],
    ['IBD', 'Inflammatory bowel disease: conditions causing ongoing inflammation in the digestive tract.', ['ibd', 'inflammatory bowel disease']],
    ['asthma', 'A condition in which the airways become inflamed and narrow at times.'],
    ['COPD', 'Chronic obstructive pulmonary disease: lung conditions causing ongoing airflow limitation.', ['copd', 'chronic obstructive pulmonary disease']],
    ['sleep apnea', 'Repeated pauses or reductions in breathing during sleep.', ['sleep apnoea']],
    ['migraine', 'A neurological condition that can include headache, nausea, and light or sound sensitivity.'],
    ['dehydration', 'Not having enough fluid for the body’s needs.'],
    ['nausea', 'Feeling as though you might vomit.'],
    ['dysphagia', 'Difficulty swallowing.'],
    ['dysuria', 'Pain or discomfort when urinating.'],
    ['erythema', 'Redness of skin or tissue.'],
    ['pruritus', 'Itching.'],
    ['anxiety', 'Feelings of worry or fear; persistent symptoms may need assessment.'],
    ['depression', 'A mood condition that can affect energy, sleep, motivation, and daily activities.'],
    ['ADHD', 'Attention-deficit/hyperactivity disorder, which can affect attention, impulsivity, and activity levels.', ['adhd']],
    ['PTSD', 'Post-traumatic stress disorder, which can develop after trauma.', ['ptsd']],
    ['referral', 'A request or recommendation to see another healthcare professional.'],
    ['follow-up', 'A later appointment or check to review progress or test results.', ['follow up']],
    ['reference range', 'The comparison interval a lab uses for a result; ranges can differ between labs.']
  ];

  function normalize(text) {
    return String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9+]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function matchConditions(text) {
    const value = normalize(text);
    if (!value) return [];
    const padded = ` ${value} `;
    const hits = [];
    conditions.forEach(entry => [...new Set([entry.name, ...entry.aliases].map(normalize))].forEach(alias => {
      const needle = ` ${alias} `;
      let cursor = 0;
      let start;
      while ((start = padded.indexOf(needle, cursor)) !== -1) {
        hits.push({ entry, start, end: start + needle.length, length: alias.length });
        cursor = start + 1;
      }
    }));
    // A generic word inside a specific diagnosis is not a second diagnosis.
    // Preserve it when it appears separately, e.g. "arthritis and lupus".
    const specific = hits.filter(hit => !hits.some(other =>
      other.entry !== hit.entry && other.length > hit.length &&
      other.start <= hit.start && other.end >= hit.end));
    return conditions.filter(entry => specific.some(hit => hit.entry === entry))
      .sort((a, b) => Math.max(...specific.filter(hit => hit.entry === b).map(hit => hit.length)) -
        Math.max(...specific.filter(hit => hit.entry === a).map(hit => hit.length)));
  }
  function glossaryMatches(text) {
    const normalized = ` ${normalize(text)} `;
    return glossary.filter(([name, , aliases = []]) => [name, ...aliases].some(alias => normalized.includes(` ${normalize(alias)} `)))
      .map(([name, meaning]) => [name, meaning]);
  }
  function explainLocal(text) {
    const input = String(text || '').trim();
    if (!input) return 'Add medical notes or lab results to get an explanation.';
    const found = glossaryMatches(input);
    const lines = ['Your notes, in everyday language', 'I received your notes. Here is what the wording can mean:'];
    if (found.length) lines.push(...found.map(([name, meaning]) => `${name}: ${meaning}`));
    else lines.push('I could not match these words to the local glossary. I cannot reliably rewrite unfamiliar wording. Keep the original text and ask your clinician to explain it; adding the full sentence may help.');
    if (/\d/.test(input)) lines.push('Your notes include numbers. A value alone cannot show whether a result is healthy or concerning: use the units, your lab’s reference range, and your clinician’s assessment.');
    if (/\b(?:no|not|denies|without|negative for|rule out|possible|suspected)\b/i.test(input)) lines.push('Words such as “no,” “possible,” and “rule out” change the meaning. A term appearing in a report does not mean you have that condition.');
    lines.push('Questions for your visit: What does this mean for me? Is follow-up needed? What changes should I watch for?', 'This explains wording and does not diagnose a condition or recommend a treatment.');
    return lines.join('\n\n');
  }

  let options = {};
  let decodeVersion = 0;
  let fileVersion = 0;
  let specialistVersion = 0;
  let lastExplanation = '';
  const $ = selector => window.document.querySelector(selector);
  const notify = text => options.toast?.(text);
  function appendText(holder, text, tag = 'p', className = '') {
    const node = window.document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    holder.append(node);
    return node;
  }
  function renderExplanation(text, source) {
    const result = $('#decode-result');
    result.replaceChildren();
    appendText(result, 'Your notes, in everyday language', 'h3');
    appendText(result, source, 'p', 'tool-source');
    String(text).split(/\n+/).filter(line => line.trim() && line.trim() !== 'Your notes, in everyday language')
      .forEach(line => appendText(result, line.trim()));
    lastExplanation = text;
    if ($('#decoder-save')) {
      $('#decoder-save').disabled = false;
      $('#decoder-save').hidden = false;
    }
  }
  function clearExplanation() {
    decodeVersion += 1;
    lastExplanation = '';
    const result = $('#decode-result');
    if (result) {
      result.replaceChildren();
      result.removeAttribute('aria-busy');
    }
    if ($('#decode')) $('#decode').disabled = false;
    if ($('#decoder-save')) {
      $('#decoder-save').disabled = true;
      $('#decoder-save').hidden = true;
    }
  }
  async function decode() {
    const text = $('#medical-text').value.trim();
    if (!text) {
      clearExplanation();
      notify('Paste, upload, or dictate your medical notes to get started.');
      $('#medical-text').focus();
      return false;
    }
    const version = ++decodeVersion;
    const result = $('#decode-result');
    const button = $('#decode');
    result.replaceChildren();
    result.setAttribute('aria-busy', 'true');
    appendText(result, 'Reading your notes…');
    button.disabled = true;
    if ($('#decoder-save')) $('#decoder-save').disabled = true;
    let explanation = explainLocal(text);
    let source = 'Local glossary · explanations of wording';
    try {
      if (options.ai && text.length <= 12000) {
        const response = await options.ai('decoder', { text });
        if (response?.text) {
          explanation = response.text;
          source = 'AI explanation · check the original notes with your clinician';
        }
      } else if (text.length > 12000) {
        notify('These notes exceed the AI limit. The local glossary can still explain matching terms.');
      }
    } catch {
      source = 'Local glossary · AI could not respond, so matching terms are explained below';
    }
    if (version !== decodeVersion || $('#medical-text').value.trim() !== text) return false;
    renderExplanation(explanation, source);
    result.removeAttribute('aria-busy');
    button.disabled = false;
    options.speak?.(explanation);
    return true;
  }
  async function readFile(file) {
    if (!file) return;
    const version = ++fileVersion;
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a text file smaller than 1 MB.');
      if (!/\.(?:txt|csv|md)$/i.test(file.name)) throw new Error('Use a .txt, .csv, or .md file. For a PDF or image, copy its text into the notes box.');
      const text = await file.text();
      if (version !== fileVersion) return;
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('This file does not appear to contain plain text. Paste the readable notes instead.');
      if (!text.trim()) throw new Error('This file is empty. Choose another file or paste your notes.');
      clearExplanation();
      $('#medical-text').value = text.replace(/^\uFEFF/, '');
      if ($('#file-name')) $('#file-name').textContent = `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`;
      if ($('#file-clear')) $('#file-clear').hidden = false;
      notify('Notes added. Ready to explain.');
    } catch (error) {
      if (version === fileVersion) notify(error.message || 'Unable to read this file. Paste or dictate your notes instead.');
    } finally {
      if ($('#document')) $('#document').value = '';
    }
  }
  function clearFile() {
    fileVersion += 1;
    if ($('#document')) $('#document').value = '';
    if ($('#file-name')) $('#file-name').textContent = 'No file selected';
    if ($('#file-clear')) $('#file-clear').hidden = true;
  }
  function selectedCondition() {
    return conditions.find(entry => entry.id === $('#specialty')?.value) || conditions[0];
  }
  function currentDirectory() {
    return selectedCondition().resources[0];
  }
  function appendLink(holder, entry) {
    const link = window.document.createElement('a');
    link.href = entry.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    appendText(link, `${entry.name} ↗`, 'strong');
    appendText(link, entry.description, 'span');
    holder.append(link);
  }
  function renderDirectory() {
    specialistVersion += 1;
    const holder = $('#specialist-results');
    if (!holder) return;
    if ($('#specialty')?.disabled && !$('#specialty').options.length) return;
    holder.replaceChildren();
    const entry = selectedCondition();
    appendText(holder, entry.summary, 'p');
    appendText(holder, `Specialties to discuss with your clinician: ${entry.specialties.join(', ')}.`, 'p', 'specialty-summary');
    entry.resources.forEach(item => appendLink(holder, item));
    const primary = entry.specialties[0];
    appendLink(holder, resource('Healthgrades clinician search', `Search a general clinician directory for ${primary}. Verify condition experience and insurance directly.`, `https://www.healthgrades.com/usearch?what=${encodeURIComponent(primary)}`));
    const location = $('#specialist-location')?.value.trim();
    if (location) appendLink(holder, resource(`Search ${primary} near ${location}`, 'Opens a Google Maps search. These are search results, not verified recommendations.', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${primary} near ${location}`)}`));
    const note = window.document.createElement('div');
    note.className = 'plan-note';
    appendText(note, 'Before booking, ask: Do you have experience with my condition? Are you accepting new patients and my insurance? Is a referral required? Can you offer accessible or virtual visits?');
    holder.append(note);
    if ($('#specialist-ai')) $('#specialist-ai').disabled = false;
  }
  function chooseSpecialty(text) {
    const entry = matchConditions(text)[0];
    if (!entry || !$('#specialty')) return false;
    // A voice selection may have been excluded by a previous typed filter.
    const search = $('#specialist-search');
    if (search) search.value = '';
    populateConditions(conditions, entry.id);
    renderDirectory();
    return true;
  }
  function populateConditions(list, chosen = selectedCondition().id) {
    const select = $('#specialty');
    select.replaceChildren();
    list.forEach(entry => {
      const option = window.document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.name;
      option.selected = entry.id === chosen;
      select.append(option);
    });
  }
  function filterConditions() {
    const query = normalize($('#specialist-search').value);
    const list = conditions.filter(entry => !query || [entry.name, ...entry.aliases, ...entry.specialties].some(value => normalize(value).includes(query)));
    if (list.length) {
      populateConditions(list);
      $('#specialty').disabled = false;
      if ($('#specialist-save')) $('#specialist-save').disabled = false;
      if ($('#specialist-ai')) $('#specialist-ai').disabled = false;
      renderDirectory();
    } else {
      specialistVersion += 1;
      $('#specialty').replaceChildren();
      $('#specialty').disabled = true;
      if ($('#specialist-save')) $('#specialist-save').disabled = true;
      if ($('#specialist-ai')) $('#specialist-ai').disabled = true;
      $('#specialist-results').replaceChildren();
      appendText($('#specialist-results'), 'No matching condition or specialty in this library. Try a broader term such as “heart,” “pain,” or “other.”');
    }
  }
  function specialtyGuide(entry) {
    return `For ${entry.name}, ask your primary care clinician whether ${entry.specialties.join(', ')} is appropriate for your situation.\n\nAsk a potential office about condition experience, referrals, insurance, appointment availability, and accessibility. A directory listing is a starting point and does not verify expertise.`;
  }
  async function specialistAI() {
    const entry = selectedCondition();
    const holder = $('#specialist-results');
    const version = specialistVersion;
    const button = $('#specialist-ai');
    button.disabled = true;
    const responseNode = appendText(holder, 'Preparing a guide…', 'p', 'specialist-guidance');
    try {
      const response = await options.ai?.('specialists', { text: `Help me prepare to find care for ${entry.name}. Suggest appropriate specialties and questions to ask an office.`, context: { location: $('#specialist-location')?.value.trim() || '' } });
      if (version !== specialistVersion) return;
      responseNode.textContent = response?.text || specialtyGuide(entry);
      if (!response?.text) notify('Showing a local specialty guide. Enable AI tools for a tailored response.');
    } catch {
      if (version === specialistVersion) responseNode.textContent = `${specialtyGuide(entry)}\n\nAI could not respond. These local resources are still available.`;
    } finally {
      if (version === specialistVersion) button.disabled = false;
    }
  }
  function init(config = {}) {
    options = config;
    if ($('#decode')) $('#decode').onclick = decode;
    $('#medical-text')?.addEventListener('input', clearExplanation);
    if ($('#document')) $('#document').onchange = event => readFile(event.target.files[0]);
    if ($('#file-clear')) $('#file-clear').onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      clearFile();
      $('#medical-text').value = '';
      clearExplanation();
    };
    const zone = $('#upload-zone');
    if (zone) {
      zone.addEventListener('keydown', event => {
        if (event.target === zone && ['Enter', ' '].includes(event.key)) {
          event.preventDefault();
          $('#document').click();
        }
      });
      zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drag-active'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));
      zone.addEventListener('drop', event => {
        event.preventDefault();
        zone.classList.remove('drag-active');
        if (event.dataTransfer?.files.length > 1) { notify('Choose one notes file at a time.'); return; }
        readFile(event.dataTransfer?.files[0]);
      });
    }
    if ($('#decoder-example')) $('#decoder-example').onclick = () => {
      clearFile();
      clearExplanation();
      $('#medical-text').value = 'Patient reports tachycardia and orthostatic intolerance. CBC: Hgb 10.5 g/dL. TSH and eGFR within normal limits. No acute findings on ECG. Follow-up recommended.';
      $('#medical-text').focus();
    };
    if ($('#decoder-clear')) $('#decoder-clear').onclick = () => {
      clearFile();
      $('#medical-text').value = '';
      clearExplanation();
      $('#medical-text').focus();
    };
    if ($('#decoder-save')) {
      $('#decoder-save').disabled = true;
      $('#decoder-save').hidden = true;
      $('#decoder-save').onclick = () => {
        if (!lastExplanation) return;
        const matches = glossaryMatches($('#medical-text').value).slice(0, 3).map(([name]) => name);
        options.addTask?.(matches.length ? `Ask my clinician what ${matches.join(', ')} in my notes means for me` : 'Ask my clinician to explain the unfamiliar wording in my medical notes');
        notify('A question about these notes was added to your care plan.');
      };
    }
    if ($('#specialty')) {
      populateConditions(conditions, conditions[0].id);
      $('#specialty').onchange = renderDirectory;
      renderDirectory();
    }
    $('#specialist-search')?.addEventListener('input', filterConditions);
    $('#specialist-location')?.addEventListener('input', renderDirectory);
    if ($('#specialist-save')) $('#specialist-save').onclick = () => {
      const entry = selectedCondition();
      options.addTask?.(`Ask whether a referral to ${entry.specialties[0]} is appropriate for ${entry.name}`);
      options.addTask?.(`Confirm the specialist's experience with ${entry.name}, insurance, availability, and accessibility`);
      notify('Specialist questions added to your care plan.');
    };
    if ($('#specialist-ai')) $('#specialist-ai').onclick = specialistAI;
  }

  window.CareMedical = {
    conditions, glossary, conditionNames: () => conditions.map(entry => entry.name),
    matchConditions, glossaryMatches, explainLocal, init, decode, renderDirectory,
    chooseSpecialty, currentDirectory
  };
})(window);
