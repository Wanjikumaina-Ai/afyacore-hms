-- ============================================================
-- AFYACORE HMS - MASTER DATABASE SCHEMA v1.0
-- Enterprise Hospital Management System
-- All tables, indexes, triggers, and constraints
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000; -- 64MB cache
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456; -- 256MB memory-mapped I/O

-- ============================================================
-- SECTION 1: LICENSING & SYSTEM IDENTITY
-- ============================================================

CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  encrypted INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS license_info (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  license_key TEXT NOT NULL UNIQUE,
  hospital_name TEXT NOT NULL,
  license_type TEXT NOT NULL CHECK(license_type IN ('perpetual','subscription','trial')),
  max_branches INTEGER NOT NULL DEFAULT 1,
  max_users INTEGER NOT NULL DEFAULT 50,
  hardware_fingerprint TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT,
  activated_at TEXT,
  last_verified TEXT,
  features TEXT NOT NULL DEFAULT '{}', -- JSON
  is_active INTEGER DEFAULT 1,
  tamper_hash TEXT NOT NULL
);

-- ============================================================
-- SECTION 2: ORGANIZATION STRUCTURE
-- ============================================================

CREATE TABLE IF NOT EXISTS hospitals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  registration_number TEXT UNIQUE,
  license_number TEXT,
  tax_pin TEXT,
  nhif_code TEXT,
  address TEXT,
  city TEXT,
  county TEXT,
  country TEXT DEFAULT 'Kenya',
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_path TEXT,
  settings TEXT DEFAULT '{}', -- JSON for hospital-level config
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  hospital_id TEXT NOT NULL REFERENCES hospitals(id),
  name TEXT NOT NULL,
  branch_code TEXT NOT NULL UNIQUE,
  type TEXT DEFAULT 'branch' CHECK(type IN ('headquarters','branch','clinic','satellite')),
  address TEXT,
  city TEXT,
  county TEXT,
  phone TEXT,
  email TEXT,
  bed_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sync_enabled INTEGER DEFAULT 1,
  last_sync TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN (
    'opd','ipd','icu','emergency','theatre','laboratory',
    'radiology','pharmacy','billing','hr','administration',
    'records','mortuary','physiotherapy','dental','maternity',
    'pediatric','psychiatric','nutrition','housekeeping','security'
  )),
  floor TEXT,
  phone TEXT,
  head_id TEXT, -- references staff(id)
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 3: ROLES & PERMISSIONS (RBAC)
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'administration','medical','nursing','laboratory','radiology',
    'pharmacy','finance','front_office','hr','operations',
    'it','patient','support'
  )),
  description TEXT,
  is_system_role INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  module TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create','read','update','delete','approve','export','print','void','assign')),
  description TEXT,
  UNIQUE(module, resource, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at TEXT DEFAULT (datetime('now')),
  granted_by TEXT,
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- SECTION 4: USERS & STAFF
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id TEXT UNIQUE,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  gender TEXT CHECK(gender IN ('male','female','other')),
  date_of_birth TEXT,
  national_id TEXT,
  passport_number TEXT,
  profile_photo TEXT,
  role_id TEXT NOT NULL REFERENCES roles(id),
  branch_id TEXT REFERENCES branches(id),
  department_id TEXT REFERENCES departments(id),
  is_active INTEGER DEFAULT 1,
  is_locked INTEGER DEFAULT 0,
  failed_login_count INTEGER DEFAULT 0,
  last_login TEXT,
  last_login_ip TEXT,
  last_login_device TEXT,
  password_changed_at TEXT DEFAULT (datetime('now')),
  password_expires_at TEXT,
  mfa_enabled INTEGER DEFAULT 0,
  mfa_secret TEXT,
  mfa_backup_codes TEXT, -- JSON array
  session_token TEXT,
  session_expires TEXT,
  preferences TEXT DEFAULT '{}', -- JSON
  must_change_password INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  job_title TEXT,
  specialization TEXT,
  qualification TEXT, -- highest qualification
  license_number TEXT, -- medical license
  license_expiry TEXT,
  employment_type TEXT CHECK(employment_type IN ('full_time','part_time','contract','locum','intern')),
  employment_date TEXT,
  termination_date TEXT,
  basic_salary REAL,
  bank_name TEXT,
  bank_account TEXT,
  bank_branch TEXT,
  nhif_number TEXT,
  nssf_number TEXT,
  kra_pin TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  address TEXT,
  bio TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_branch_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  access_level TEXT DEFAULT 'standard' CHECK(access_level IN ('standard','admin','read_only')),
  granted_at TEXT DEFAULT (datetime('now')),
  granted_by TEXT,
  PRIMARY KEY (user_id, branch_id)
);

-- ============================================================
-- SECTION 5: PATIENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_number TEXT NOT NULL UNIQUE, -- e.g. AFC-2024-001234
  branch_id TEXT NOT NULL REFERENCES branches(id),
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('male','female','other')),
  blood_group TEXT CHECK(blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),
  national_id TEXT,
  passport TEXT,
  phone TEXT,
  email TEXT,
  marital_status TEXT CHECK(marital_status IN ('single','married','divorced','widowed','other')),
  occupation TEXT,
  religion TEXT,
  nationality TEXT DEFAULT 'Kenyan',
  address TEXT,
  city TEXT,
  county TEXT,
  next_of_kin_name TEXT,
  next_of_kin_relation TEXT,
  next_of_kin_phone TEXT,
  next_of_kin_address TEXT,
  nhif_number TEXT,
  nhif_card_number TEXT,
  insurance_provider TEXT,
  insurance_number TEXT,
  insurance_expiry TEXT,
  allergies TEXT, -- JSON array
  chronic_conditions TEXT, -- JSON array
  profile_photo TEXT,
  is_active INTEGER DEFAULT 1,
  is_deceased INTEGER DEFAULT 0,
  deceased_date TEXT,
  portal_enabled INTEGER DEFAULT 0,
  portal_password_hash TEXT,
  registered_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patient_vitals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  visit_id TEXT,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  temperature REAL, -- Celsius
  temperature_method TEXT CHECK(temperature_method IN ('oral','axillary','rectal','tympanic')),
  pulse_rate INTEGER, -- bpm
  respiratory_rate INTEGER, -- breaths/min
  blood_pressure_systolic INTEGER,
  blood_pressure_diastolic INTEGER,
  bp_position TEXT CHECK(bp_position IN ('sitting','standing','lying')),
  oxygen_saturation REAL, -- %
  weight REAL, -- kg
  height REAL, -- cm
  bmi REAL,
  blood_glucose REAL, -- mmol/L
  pain_scale INTEGER CHECK(pain_scale BETWEEN 0 AND 10),
  notes TEXT,
  recorded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patient_medical_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  history_type TEXT NOT NULL CHECK(history_type IN (
    'past_illness','surgery','hospitalization','family_history',
    'allergy','chronic_condition','vaccination','social_history',
    'obstetric_history','drug_history'
  )),
  description TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  is_ongoing INTEGER DEFAULT 0,
  severity TEXT CHECK(severity IN ('mild','moderate','severe')),
  notes TEXT,
  recorded_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 6: APPOINTMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  appointment_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  doctor_id TEXT NOT NULL REFERENCES users(id),
  department_id TEXT REFERENCES departments(id),
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  end_time TEXT,
  type TEXT NOT NULL CHECK(type IN ('opd','follow_up','specialist','emergency','teleconsult','procedure')),
  reason TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('normal','urgent','emergency')),
  status TEXT DEFAULT 'scheduled' CHECK(status IN (
    'scheduled','confirmed','checked_in','in_progress',
    'completed','cancelled','no_show','rescheduled'
  )),
  cancellation_reason TEXT,
  notes TEXT,
  reminder_sent INTEGER DEFAULT 0,
  booked_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 7: VISITS / ENCOUNTERS (OPD & IPD)
-- ============================================================

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  visit_number TEXT NOT NULL UNIQUE, -- e.g. VIS-2024-000045
  branch_id TEXT NOT NULL REFERENCES branches(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  appointment_id TEXT REFERENCES appointments(id),
  visit_type TEXT NOT NULL CHECK(visit_type IN ('opd','ipd','emergency','day_case','referral')),
  department_id TEXT REFERENCES departments(id),
  attending_doctor_id TEXT REFERENCES users(id),
  triage_level TEXT CHECK(triage_level IN ('1_immediate','2_urgent','3_less_urgent','4_non_urgent','5_deceased')),
  chief_complaint TEXT,
  presenting_complaints TEXT, -- JSON array
  status TEXT DEFAULT 'active' CHECK(status IN ('active','admitted','discharged','transferred','absconded','deceased')),
  check_in_time TEXT DEFAULT (datetime('now')),
  check_out_time TEXT,
  admission_id TEXT, -- references admissions(id)
  discharge_summary TEXT,
  discharge_condition TEXT CHECK(discharge_condition IN ('improved','stable','critical','deceased','absconded')),
  follow_up_date TEXT,
  follow_up_instructions TEXT,
  referral_out INTEGER DEFAULT 0,
  referral_to TEXT,
  referral_reason TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 8: CLINICAL DOCUMENTATION (EMR)
-- ============================================================

CREATE TABLE IF NOT EXISTS clinical_notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  visit_id TEXT NOT NULL REFERENCES visits(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  note_type TEXT NOT NULL CHECK(note_type IN (
    'history','examination','assessment','plan','progress',
    'discharge','referral','procedure','nursing','soap'
  )),
  content TEXT NOT NULL, -- rich text / structured JSON
  is_signed INTEGER DEFAULT 0,
  signed_by TEXT REFERENCES users(id),
  signed_at TEXT,
  is_amended INTEGER DEFAULT 0,
  amendment_reason TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS diagnoses (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  visit_id TEXT NOT NULL REFERENCES visits(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  icd10_code TEXT,
  icd10_description TEXT,
  diagnosis_text TEXT NOT NULL,
  diagnosis_type TEXT DEFAULT 'working' CHECK(diagnosis_type IN ('working','provisional','confirmed','differential','final')),
  severity TEXT CHECK(severity IN ('mild','moderate','severe','critical')),
  is_primary INTEGER DEFAULT 0,
  diagnosed_by TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS treatment_plans (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  visit_id TEXT NOT NULL REFERENCES visits(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  plan_title TEXT NOT NULL,
  goals TEXT, -- JSON array
  interventions TEXT, -- JSON array
  status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','discontinued','on_hold')),
  start_date TEXT DEFAULT (date('now')),
  end_date TEXT,
  review_date TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 9: ADMISSIONS (IPD)
-- ============================================================

CREATE TABLE IF NOT EXISTS wards (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  department_id TEXT REFERENCES departments(id),
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('general','private','semi_private','icu','hdu','nicu','paediatric','maternity','psychiatric','isolation')),
  floor TEXT,
  total_beds INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS beds (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  ward_id TEXT NOT NULL REFERENCES wards(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  bed_number TEXT NOT NULL,
  bed_type TEXT DEFAULT 'standard' CHECK(bed_type IN ('standard','icu','paediatric','maternity','isolation','electric')),
  status TEXT DEFAULT 'available' CHECK(status IN ('available','occupied','reserved','maintenance','dirty')),
  features TEXT, -- JSON: ['oxygen','suction','monitor']
  notes TEXT,
  UNIQUE(ward_id, bed_number)
);

CREATE TABLE IF NOT EXISTS admissions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  admission_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  visit_id TEXT NOT NULL REFERENCES visits(id),
  ward_id TEXT NOT NULL REFERENCES wards(id),
  bed_id TEXT NOT NULL REFERENCES beds(id),
  admitting_doctor_id TEXT NOT NULL REFERENCES users(id),
  admitting_diagnosis TEXT NOT NULL,
  admission_type TEXT DEFAULT 'elective' CHECK(admission_type IN ('elective','emergency','transfer_in','direct')),
  admission_datetime TEXT DEFAULT (datetime('now')),
  expected_discharge TEXT,
  actual_discharge TEXT,
  discharge_doctor_id TEXT REFERENCES users(id),
  discharge_diagnosis TEXT,
  discharge_condition TEXT CHECK(discharge_condition IN ('improved','stable','critical','deceased','absconded','transferred')),
  transfer_to TEXT, -- hospital name if transferred out
  transfer_reason TEXT,
  length_of_stay INTEGER, -- days, computed
  status TEXT DEFAULT 'active' CHECK(status IN ('active','discharged','transferred','absconded','deceased')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Nursing care records
CREATE TABLE IF NOT EXISTS nursing_records (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  admission_id TEXT NOT NULL REFERENCES admissions(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  record_type TEXT NOT NULL CHECK(record_type IN (
    'intake_output','medication_given','wound_care','position_change',
    'patient_education','assessment','observation','procedure'
  )),
  shift TEXT CHECK(shift IN ('morning','afternoon','night')),
  content TEXT NOT NULL, -- JSON structured
  recorded_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 10: ICU MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS icu_monitoring (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  admission_id TEXT NOT NULL REFERENCES admissions(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  gcs_eye INTEGER CHECK(gcs_eye BETWEEN 1 AND 4),
  gcs_verbal INTEGER CHECK(gcs_verbal BETWEEN 1 AND 5),
  gcs_motor INTEGER CHECK(gcs_motor BETWEEN 1 AND 6),
  gcs_total INTEGER,
  ventilator_mode TEXT,
  fio2 REAL,
  tidal_volume REAL,
  peep REAL,
  respiratory_rate_set INTEGER,
  peak_pressure REAL,
  cvp REAL,
  arterial_bp_systolic INTEGER,
  arterial_bp_diastolic INTEGER,
  urine_output REAL, -- ml/hr
  fluid_balance REAL,
  sedation_score TEXT,
  pain_score INTEGER,
  vasopressor_doses TEXT, -- JSON
  notes TEXT,
  recorded_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 11: THEATRE / SURGERY
-- ============================================================

CREATE TABLE IF NOT EXISTS theatres (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('general','orthopaedic','cardiothoracic','neuro','obstetric','ophthalmic','dental','day_case')),
  status TEXT DEFAULT 'available' CHECK(status IN ('available','in_use','cleaning','maintenance')),
  equipment TEXT -- JSON
);

CREATE TABLE IF NOT EXISTS surgical_bookings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  booking_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  visit_id TEXT REFERENCES visits(id),
  admission_id TEXT REFERENCES admissions(id),
  theatre_id TEXT NOT NULL REFERENCES theatres(id),
  lead_surgeon_id TEXT NOT NULL REFERENCES users(id),
  anaesthetist_id TEXT REFERENCES users(id),
  procedure_name TEXT NOT NULL,
  icd10_procedure_code TEXT,
  urgency TEXT DEFAULT 'elective' CHECK(urgency IN ('elective','urgent','emergency')),
  anaesthesia_type TEXT CHECK(anaesthesia_type IN ('general','spinal','epidural','local','regional','sedation')),
  estimated_duration INTEGER, -- minutes
  scheduled_date TEXT NOT NULL,
  scheduled_start TEXT,
  actual_start TEXT,
  actual_end TEXT,
  status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','in_progress','completed','cancelled','postponed')),
  pre_op_notes TEXT,
  intra_op_notes TEXT,
  post_op_notes TEXT,
  complications TEXT,
  implants_used TEXT, -- JSON
  blood_transfused REAL, -- units
  swab_count_correct INTEGER DEFAULT 1,
  instrument_count_correct INTEGER DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 12: EMERGENCY ROOM
-- ============================================================

CREATE TABLE IF NOT EXISTS emergency_triage (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  visit_id TEXT NOT NULL REFERENCES visits(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  triaged_by TEXT NOT NULL REFERENCES users(id),
  triage_time TEXT DEFAULT (datetime('now')),
  presenting_complaint TEXT NOT NULL,
  mechanism_of_injury TEXT,
  triage_level INTEGER NOT NULL CHECK(triage_level BETWEEN 1 AND 5),
  consciousness TEXT CHECK(consciousness IN ('alert','voice','pain','unresponsive')),
  airway TEXT CHECK(airway IN ('clear','maintained','obstructed','secured')),
  breathing TEXT CHECK(breathing IN ('normal','laboured','absent')),
  circulation TEXT CHECK(circulation IN ('normal','compromised','absent')),
  disability_gcs INTEGER,
  exposure_notes TEXT,
  allergies_confirmed TEXT,
  medications_confirmed TEXT,
  last_meal_time TEXT,
  events_leading TEXT,
  risk_flags TEXT, -- JSON: ['fall_risk','violent','infectious']
  re_triage_time TEXT,
  re_triage_level INTEGER,
  disposition TEXT CHECK(disposition IN ('admit','discharge','transfer','theatre','icu','deceased')),
  notes TEXT
);

-- ============================================================
-- SECTION 13: LABORATORY
-- ============================================================

CREATE TABLE IF NOT EXISTS lab_test_catalog (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT REFERENCES branches(id), -- NULL = global
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'haematology','biochemistry','microbiology','serology','urinalysis',
    'histopathology','cytology','parasitology','virology','immunology',
    'hormones','tumour_markers','drugs','other'
  )),
  specimen_type TEXT, -- blood, urine, stool, etc.
  specimen_volume TEXT,
  container_type TEXT,
  processing_time_hours INTEGER DEFAULT 24,
  reference_range_male TEXT,
  reference_range_female TEXT,
  reference_range_child TEXT,
  units TEXT,
  method TEXT,
  equipment TEXT,
  price REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  requires_fasting INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS lab_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  request_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  visit_id TEXT REFERENCES visits(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  urgency TEXT DEFAULT 'routine' CHECK(urgency IN ('routine','urgent','stat')),
  clinical_info TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN (
    'pending','specimen_collected','processing','resulted','verified','reported','cancelled'
  )),
  requested_at TEXT DEFAULT (datetime('now')),
  specimen_collected_at TEXT,
  specimen_collected_by TEXT REFERENCES users(id),
  resulted_at TEXT,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS lab_request_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  request_id TEXT NOT NULL REFERENCES lab_requests(id),
  test_id TEXT NOT NULL REFERENCES lab_test_catalog(id),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','resulted','cancelled')),
  result_value TEXT,
  result_unit TEXT,
  result_flag TEXT CHECK(result_flag IN ('normal','high','low','critical_high','critical_low','abnormal')),
  reference_range TEXT,
  result_notes TEXT,
  resulted_by TEXT REFERENCES users(id),
  resulted_at TEXT
);

-- ============================================================
-- SECTION 14: RADIOLOGY
-- ============================================================

CREATE TABLE IF NOT EXISTS radiology_equipment (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  modality TEXT NOT NULL CHECK(modality IN ('xray','ct','mri','ultrasound','fluoroscopy','mammography','dexa','pet','nuclear')),
  model TEXT,
  serial_number TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','maintenance','offline')),
  pacs_device_id TEXT
);

CREATE TABLE IF NOT EXISTS radiology_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  request_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  visit_id TEXT REFERENCES visits(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  equipment_id TEXT REFERENCES radiology_equipment(id),
  modality TEXT NOT NULL,
  study_description TEXT NOT NULL,
  clinical_indication TEXT,
  contrast_required INTEGER DEFAULT 0,
  urgency TEXT DEFAULT 'routine' CHECK(urgency IN ('routine','urgent','stat')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','scheduled','in_progress','completed','reported','cancelled')),
  scheduled_at TEXT,
  performed_at TEXT,
  performed_by TEXT REFERENCES users(id),
  radiologist_id TEXT REFERENCES users(id),
  report TEXT,
  impression TEXT,
  reported_at TEXT,
  pacs_study_id TEXT, -- DICOM study UID
  image_count INTEGER DEFAULT 0,
  radiation_dose REAL, -- mGy
  requested_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 15: PHARMACY
-- ============================================================

CREATE TABLE IF NOT EXISTS drug_catalog (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  generic_name TEXT NOT NULL,
  brand_name TEXT,
  drug_class TEXT,
  category TEXT NOT NULL CHECK(category IN (
    'analgesic','antibiotic','antiviral','antifungal','antihypertensive',
    'antidiabetic','anticoagulant','anticonvulsant','antidepressant',
    'antipsychotic','bronchodilator','cardiac','diuretic','hormone',
    'immunosuppressant','nsaid','steroid','vaccine','vitamin',
    'contraceptive','anaesthetic','chemotherapy','other'
  )),
  formulation TEXT, -- tablet, capsule, syrup, injection, etc.
  strength TEXT,
  unit TEXT, -- mg, ml, IU
  dosage_forms TEXT, -- JSON array
  controlled_substance INTEGER DEFAULT 0,
  narcotic INTEGER DEFAULT 0,
  requires_prescription INTEGER DEFAULT 1,
  storage_condition TEXT,
  interactions TEXT, -- JSON array of drug IDs
  contraindications TEXT, -- JSON
  side_effects TEXT, -- JSON
  pregnancy_category TEXT CHECK(pregnancy_category IN ('A','B','C','D','X','N')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pharmacy_inventory (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  drug_id TEXT NOT NULL REFERENCES drug_catalog(id),
  batch_number TEXT NOT NULL,
  supplier_id TEXT,
  quantity_in_stock REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL,
  selling_price REAL NOT NULL,
  reorder_level INTEGER DEFAULT 10,
  reorder_quantity INTEGER DEFAULT 100,
  manufacture_date TEXT,
  expiry_date TEXT NOT NULL,
  location TEXT, -- shelf/bin location
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(branch_id, drug_id, batch_number)
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  prescription_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  visit_id TEXT REFERENCES visits(id),
  prescribed_by TEXT NOT NULL REFERENCES users(id),
  prescription_date TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','dispensed','partial','cancelled','expired')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  prescription_id TEXT NOT NULL REFERENCES prescriptions(id),
  drug_id TEXT NOT NULL REFERENCES drug_catalog(id),
  drug_name TEXT NOT NULL, -- denormalized for history
  dose TEXT NOT NULL,
  frequency TEXT NOT NULL,
  route TEXT NOT NULL CHECK(route IN ('oral','iv','im','sc','topical','inhalation','rectal','ophthalmic','nasal','sublingual')),
  duration_days INTEGER,
  quantity_prescribed REAL,
  quantity_dispensed REAL DEFAULT 0,
  instructions TEXT,
  indication TEXT,
  is_dispensed INTEGER DEFAULT 0,
  dispensed_by TEXT REFERENCES users(id),
  dispensed_at TEXT,
  substitution_allowed INTEGER DEFAULT 0,
  substitute_drug_id TEXT REFERENCES drug_catalog(id),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS pharmacy_transactions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  inventory_id TEXT NOT NULL REFERENCES pharmacy_inventory(id),
  transaction_type TEXT NOT NULL CHECK(transaction_type IN (
    'dispensing','purchase','return_to_supplier','wastage',
    'transfer_in','transfer_out','adjustment','expired_disposal'
  )),
  quantity REAL NOT NULL,
  unit_cost REAL,
  reference_id TEXT, -- prescription_id, purchase_order_id, etc.
  reference_type TEXT,
  performed_by TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 16: BILLING & FINANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_items_catalog (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT REFERENCES branches(id), -- NULL = global
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'consultation','procedure','surgery','laboratory','radiology',
    'pharmacy','ward','icu','theatre','nursing','physiotherapy',
    'dental','ambulance','accommodation','other'
  )),
  unit_price REAL NOT NULL DEFAULT 0,
  nhif_rate REAL DEFAULT 0,
  insurance_rate REAL DEFAULT 0,
  is_taxable INTEGER DEFAULT 0,
  tax_rate REAL DEFAULT 0.16,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  invoice_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  visit_id TEXT REFERENCES visits(id),
  admission_id TEXT REFERENCES admissions(id),
  invoice_date TEXT DEFAULT (datetime('now')),
  due_date TEXT,
  payment_type TEXT DEFAULT 'cash' CHECK(payment_type IN ('cash','insurance','nhif','credit','corporate')),
  insurance_provider TEXT,
  insurance_claim_number TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','pending','partial','paid','voided','disputed','bad_debt')),
  subtotal REAL NOT NULL DEFAULT 0,
  discount_percent REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  notes TEXT,
  approved_by TEXT REFERENCES users(id),
  voided_by TEXT REFERENCES users(id),
  void_reason TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  catalog_item_id TEXT REFERENCES billing_items_catalog(id),
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  discount_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  line_total REAL NOT NULL,
  is_insurance_covered INTEGER DEFAULT 0,
  insurance_amount REAL DEFAULT 0,
  patient_amount REAL,
  reference_id TEXT, -- lab_request_id, prescription_id, etc.
  reference_type TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  payment_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  payment_date TEXT DEFAULT (datetime('now')),
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN (
    'cash','mpesa','card','bank_transfer','cheque',
    'insurance','nhif','corporate','credit_note','waiver'
  )),
  mpesa_transaction_id TEXT,
  card_last_four TEXT,
  bank_reference TEXT,
  receipt_number TEXT UNIQUE,
  cashier_id TEXT NOT NULL REFERENCES users(id),
  is_reversed INTEGER DEFAULT 0,
  reversal_reason TEXT,
  reversed_by TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Insurance claims
CREATE TABLE IF NOT EXISTS insurance_claims (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  claim_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  insurance_provider TEXT NOT NULL,
  scheme_name TEXT,
  member_number TEXT,
  claim_amount REAL NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','acknowledged','pre_auth_required','pre_auth_approved','processing','approved','partial_approved','rejected','appealed','paid')),
  submission_date TEXT,
  pre_auth_number TEXT,
  approved_amount REAL,
  rejection_reason TEXT,
  payment_date TEXT,
  submitted_by TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 17: ACCOUNTING
-- ============================================================

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT REFERENCES branches(id),
  account_code TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK(account_type IN ('asset','liability','equity','revenue','expense')),
  account_subtype TEXT,
  parent_id TEXT REFERENCES chart_of_accounts(id),
  currency TEXT DEFAULT 'KES',
  is_active INTEGER DEFAULT 1,
  is_system INTEGER DEFAULT 0, -- system accounts cannot be deleted
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  entry_number TEXT NOT NULL UNIQUE,
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL,
  reference TEXT,
  reference_type TEXT, -- invoice, payment, payroll, etc.
  is_posted INTEGER DEFAULT 0,
  posted_by TEXT REFERENCES users(id),
  posted_at TEXT,
  is_reversed INTEGER DEFAULT 0,
  reversal_id TEXT REFERENCES journal_entries(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  entry_id TEXT NOT NULL REFERENCES journal_entries(id),
  account_id TEXT NOT NULL REFERENCES chart_of_accounts(id),
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  description TEXT,
  cost_center TEXT
);

-- ============================================================
-- SECTION 18: PAYROLL & HR
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_periods (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  period_name TEXT NOT NULL, -- e.g. "January 2024"
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  payment_date TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','processing','approved','paid','locked')),
  approved_by TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  period_id TEXT NOT NULL REFERENCES payroll_periods(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  basic_salary REAL NOT NULL,
  house_allowance REAL DEFAULT 0,
  transport_allowance REAL DEFAULT 0,
  medical_allowance REAL DEFAULT 0,
  other_allowances REAL DEFAULT 0,
  gross_pay REAL NOT NULL,
  paye_tax REAL DEFAULT 0,
  nhif_deduction REAL DEFAULT 0,
  nssf_deduction REAL DEFAULT 0,
  loan_deduction REAL DEFAULT 0,
  other_deductions REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  net_pay REAL NOT NULL,
  is_paid INTEGER DEFAULT 0,
  payment_method TEXT CHECK(payment_method IN ('bank','mpesa','cash','cheque')),
  payment_reference TEXT,
  UNIQUE(period_id, user_id)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  leave_type TEXT NOT NULL CHECK(leave_type IN (
    'annual','sick','maternity','paternity','compassionate',
    'study','unpaid','emergency','compensatory'
  )),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days_requested REAL NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  rejection_reason TEXT,
  cover_person_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  date TEXT NOT NULL,
  shift TEXT CHECK(shift IN ('morning','afternoon','night','flexible')),
  clock_in TEXT,
  clock_out TEXT,
  hours_worked REAL,
  overtime_hours REAL DEFAULT 0,
  status TEXT DEFAULT 'present' CHECK(status IN ('present','absent','late','half_day','on_leave','off','holiday')),
  biometric_id TEXT,
  notes TEXT,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS staff_shifts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  department_id TEXT REFERENCES departments(id),
  shift_date TEXT NOT NULL,
  shift_type TEXT NOT NULL CHECK(shift_type IN ('morning','afternoon','night','on_call','overtime')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  assigned_by TEXT REFERENCES users(id),
  notes TEXT,
  UNIQUE(user_id, shift_date, shift_type)
);

-- ============================================================
-- SECTION 19: INVENTORY & PROCUREMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  supplier_code TEXT UNIQUE,
  category TEXT CHECK(category IN ('pharmaceutical','medical_equipment','consumables','food','cleaning','it','other')),
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  kra_pin TEXT,
  payment_terms INTEGER DEFAULT 30, -- days
  credit_limit REAL DEFAULT 0,
  bank_name TEXT,
  bank_account TEXT,
  is_approved INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  item_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'medical_supply','surgical_supply','ppe','linen','cleaning',
    'office','it_equipment','medical_equipment','food','other'
  )),
  unit_of_measure TEXT NOT NULL,
  description TEXT,
  is_consumable INTEGER DEFAULT 1,
  requires_serial INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS stock_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity_in_stock REAL DEFAULT 0,
  unit_cost REAL,
  location TEXT,
  last_counted_at TEXT,
  UNIQUE(branch_id, item_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  po_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  po_date TEXT DEFAULT (date('now')),
  expected_delivery TEXT,
  actual_delivery TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','sent','partial_received','fully_received','cancelled')),
  subtotal REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  received_by TEXT REFERENCES users(id),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  po_id TEXT NOT NULL REFERENCES purchase_orders(id),
  item_id TEXT REFERENCES inventory_items(id),
  drug_id TEXT REFERENCES drug_catalog(id),
  description TEXT NOT NULL,
  quantity_ordered REAL NOT NULL,
  quantity_received REAL DEFAULT 0,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  batch_number TEXT,
  expiry_date TEXT
);

-- ============================================================
-- SECTION 20: ASSETS & EQUIPMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  asset_tag TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  department_id TEXT REFERENCES departments(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'medical_equipment','it_equipment','furniture','vehicle',
    'building','generator','hvac','other'
  )),
  make TEXT,
  model TEXT,
  serial_number TEXT,
  purchase_date TEXT,
  purchase_price REAL,
  supplier_id TEXT REFERENCES suppliers(id),
  warranty_expiry TEXT,
  useful_life_years INTEGER,
  depreciation_method TEXT CHECK(depreciation_method IN ('straight_line','reducing_balance','none')),
  current_value REAL,
  location TEXT,
  condition TEXT DEFAULT 'good' CHECK(condition IN ('new','good','fair','poor','condemned')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','maintenance','disposed','transferred','lost')),
  assigned_to TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  maintenance_type TEXT NOT NULL CHECK(maintenance_type IN ('preventive','corrective','calibration','inspection')),
  description TEXT NOT NULL,
  performed_by TEXT,
  vendor TEXT,
  cost REAL DEFAULT 0,
  scheduled_date TEXT,
  performed_date TEXT,
  next_maintenance_date TEXT,
  status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','in_progress','completed','cancelled')),
  parts_replaced TEXT, -- JSON
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 21: COMMUNICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT REFERENCES branches(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  recipient_id TEXT REFERENCES users(id), -- NULL = broadcast
  department_id TEXT REFERENCES departments(id), -- department broadcast
  subject TEXT,
  body TEXT NOT NULL,
  message_type TEXT DEFAULT 'internal' CHECK(message_type IN ('internal','notification','alert','broadcast','system')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('normal','high','urgent')),
  is_read INTEGER DEFAULT 0,
  read_at TEXT,
  parent_id TEXT REFERENCES messages(id), -- for threading
  attachments TEXT, -- JSON array
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  action_data TEXT, -- JSON
  is_read INTEGER DEFAULT 0,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 22: SYNC ENGINE (Multi-branch)
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  sync_session_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('push','pull')),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('insert','update','delete')),
  payload TEXT, -- JSON of the record
  conflict_detected INTEGER DEFAULT 0,
  conflict_resolution TEXT CHECK(conflict_resolution IN ('local_wins','remote_wins','merged','manual')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','applied','failed','conflict')),
  error_message TEXT,
  synced_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_vector_clocks (
  branch_id TEXT NOT NULL REFERENCES branches(id),
  table_name TEXT NOT NULL,
  last_seq INTEGER DEFAULT 0,
  last_sync TEXT,
  PRIMARY KEY (branch_id, table_name)
);

CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('insert','update','delete')),
  old_values TEXT, -- JSON
  new_values TEXT, -- JSON
  changed_by TEXT,
  branch_id TEXT,
  synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 23: AUDIT LOGGING (Immutable)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, -- auto-increment for ordering
  event_id TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  timestamp TEXT NOT NULL DEFAULT (datetime('now','subsec')),
  user_id TEXT,
  username TEXT,
  user_role TEXT,
  branch_id TEXT,
  branch_name TEXT,
  ip_address TEXT,
  device_fingerprint TEXT,
  session_id TEXT,
  action TEXT NOT NULL,   -- LOGIN, LOGOUT, CREATE, READ, UPDATE, DELETE, APPROVE, VOID, EXPORT, PRINT
  module TEXT NOT NULL,   -- patients, prescriptions, billing, etc.
  resource TEXT NOT NULL, -- table or entity name
  resource_id TEXT,
  previous_values TEXT,   -- JSON snapshot
  new_values TEXT,        -- JSON snapshot
  changed_fields TEXT,    -- JSON array of changed field names
  status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success','failed','blocked')),
  failure_reason TEXT,
  risk_level TEXT DEFAULT 'low' CHECK(risk_level IN ('low','medium','high','critical')),
  checksum TEXT NOT NULL  -- SHA256 of all fields for tamper detection
);

-- Audit logs MUST NOT be updatable or deletable (enforced at app layer + triggers)
CREATE TRIGGER IF NOT EXISTS prevent_audit_update
  BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'Audit logs are immutable and cannot be modified');
END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
  BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'Audit logs are immutable and cannot be deleted');
END;

-- ============================================================
-- SECTION 24: LICENSE & SECURITY
-- ============================================================

CREATE TABLE IF NOT EXISTS active_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  session_token TEXT NOT NULL UNIQUE,
  device_fingerprint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  branch_id TEXT REFERENCES branches(id),
  created_at TEXT DEFAULT (datetime('now')),
  last_activity TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  is_revoked INTEGER DEFAULT 0,
  revoked_reason TEXT
);

CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  ip_address TEXT NOT NULL,
  device_fingerprint TEXT,
  attempted_at TEXT DEFAULT (datetime('now')),
  reason TEXT
);

-- ============================================================
-- SECTION 25: ANALYTICS SNAPSHOTS
-- ============================================================

CREATE TABLE IF NOT EXISTS analytics_daily_snapshots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  snapshot_date TEXT NOT NULL,
  total_opd_visits INTEGER DEFAULT 0,
  total_admissions INTEGER DEFAULT 0,
  total_discharges INTEGER DEFAULT 0,
  total_surgeries INTEGER DEFAULT 0,
  total_lab_tests INTEGER DEFAULT 0,
  total_radiology INTEGER DEFAULT 0,
  total_prescriptions INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0,
  total_collections REAL DEFAULT 0,
  outstanding_balance REAL DEFAULT 0,
  bed_occupancy_rate REAL DEFAULT 0,
  average_length_of_stay REAL DEFAULT 0,
  generated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(branch_id, snapshot_date)
);

-- ============================================================
-- SECTION 26: PATIENT PORTAL
-- ============================================================

CREATE TABLE IF NOT EXISTS patient_portal_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  token TEXT NOT NULL UNIQUE,
  token_type TEXT CHECK(token_type IN ('login','reset_password','verify_email')),
  expires_at TEXT NOT NULL,
  is_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SECTION 27: REFERRALS (Inter-branch & External)
-- ============================================================

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  referral_number TEXT NOT NULL UNIQUE,
  from_branch_id TEXT NOT NULL REFERENCES branches(id),
  to_branch_id TEXT REFERENCES branches(id), -- NULL if external
  to_hospital TEXT, -- if external
  patient_id TEXT NOT NULL REFERENCES patients(id),
  visit_id TEXT REFERENCES visits(id),
  referring_doctor_id TEXT NOT NULL REFERENCES users(id),
  receiving_doctor_id TEXT REFERENCES users(id),
  referral_type TEXT NOT NULL CHECK(referral_type IN ('internal','external','specialist','emergency')),
  urgency TEXT DEFAULT 'routine' CHECK(urgency IN ('routine','urgent','emergency')),
  reason TEXT NOT NULL,
  clinical_summary TEXT,
  diagnosis TEXT,
  accompanying_documents TEXT, -- JSON
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','completed','cancelled')),
  accepted_at TEXT,
  rejection_reason TEXT,
  feedback TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- Patients
CREATE INDEX IF NOT EXISTS idx_patients_number ON patients(patient_number);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_national_id ON patients(national_id);
CREATE INDEX IF NOT EXISTS idx_patients_branch ON patients(branch_id);

-- Visits
CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_branch ON visits(branch_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(check_in_time);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_doctor ON visits(attending_doctor_id);

-- Appointments
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(appointment_date, appointment_time);
CREATE INDEX IF NOT EXISTS idx_appt_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status);

-- Lab
CREATE INDEX IF NOT EXISTS idx_lab_patient ON lab_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_status ON lab_requests(status);
CREATE INDEX IF NOT EXISTS idx_lab_date ON lab_requests(requested_at);

-- Billing
CREATE INDEX IF NOT EXISTS idx_invoice_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_payment_invoice ON payments(invoice_id);

-- Pharmacy
CREATE INDEX IF NOT EXISTS idx_rx_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_rx_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON pharmacy_inventory(expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_drug ON pharmacy_inventory(drug_id);

-- Audit
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_id);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON active_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON active_sessions(user_id);

-- Admissions / Beds
CREATE INDEX IF NOT EXISTS idx_admissions_patient ON admissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions(status);
CREATE INDEX IF NOT EXISTS idx_beds_status ON beds(status);
CREATE INDEX IF NOT EXISTS idx_beds_ward ON beds(ward_id);

-- Sync
CREATE INDEX IF NOT EXISTS idx_change_log_table ON change_log(table_name, synced);
CREATE INDEX IF NOT EXISTS idx_change_log_branch ON change_log(branch_id);

-- ============================================================
-- TRIGGERS: change_log population for sync
-- ============================================================

CREATE TRIGGER IF NOT EXISTS trg_patients_insert
AFTER INSERT ON patients BEGIN
  INSERT INTO change_log(table_name, record_id, operation, new_values, changed_by, branch_id)
  VALUES('patients', NEW.id, 'insert', json_object(
    'id',NEW.id,'patient_number',NEW.patient_number,'first_name',NEW.first_name,
    'last_name',NEW.last_name,'created_at',NEW.created_at
  ), NEW.registered_by, NEW.branch_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_patients_update
AFTER UPDATE ON patients BEGIN
  INSERT INTO change_log(table_name, record_id, operation, new_values, changed_by, branch_id)
  VALUES('patients', NEW.id, 'update', json_object(
    'id',NEW.id,'updated_at',NEW.updated_at
  ), NULL, NEW.branch_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_visits_insert
AFTER INSERT ON visits BEGIN
  INSERT INTO change_log(table_name, record_id, operation, new_values, changed_by, branch_id)
  VALUES('visits', NEW.id, 'insert', json_object('id',NEW.id,'visit_number',NEW.visit_number), NEW.created_by, NEW.branch_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_prescriptions_insert
AFTER INSERT ON prescriptions BEGIN
  INSERT INTO change_log(table_name, record_id, operation, new_values, changed_by, branch_id)
  VALUES('prescriptions', NEW.id, 'insert', json_object('id',NEW.id,'prescription_number',NEW.prescription_number), NEW.prescribed_by, NEW.branch_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_invoices_insert
AFTER INSERT ON invoices BEGIN
  INSERT INTO change_log(table_name, record_id, operation, new_values, changed_by, branch_id)
  VALUES('invoices', NEW.id, 'insert', json_object('id',NEW.id,'invoice_number',NEW.invoice_number,'total_amount',NEW.total_amount), NEW.created_by, NEW.branch_id);
END;

-- Bed status update when admission created
CREATE TRIGGER IF NOT EXISTS trg_bed_on_admission
AFTER INSERT ON admissions BEGIN
  UPDATE beds SET status = 'occupied' WHERE id = NEW.bed_id;
END;

-- Bed status free when discharged
CREATE TRIGGER IF NOT EXISTS trg_bed_on_discharge
AFTER UPDATE OF status ON admissions
WHEN NEW.status IN ('discharged','transferred','absconded','deceased') AND OLD.status = 'active' BEGIN
  UPDATE beds SET status = 'dirty' WHERE id = NEW.bed_id;
END;

-- Invoice balance update
CREATE TRIGGER IF NOT EXISTS trg_invoice_balance_on_payment
AFTER INSERT ON payments BEGIN
  UPDATE invoices
  SET paid_amount = paid_amount + NEW.amount,
      balance_due = total_amount - (paid_amount + NEW.amount),
      status = CASE
        WHEN (paid_amount + NEW.amount) >= total_amount THEN 'paid'
        WHEN (paid_amount + NEW.amount) > 0 THEN 'partial'
        ELSE status
      END,
      updated_at = datetime('now')
  WHERE id = NEW.invoice_id;
END;

-- ============================================================
-- SEED DATA: Roles
-- ============================================================

INSERT OR IGNORE INTO roles (id, name, display_name, category, is_system_role) VALUES
  ('role-superadmin', 'super_admin', 'Super Administrator', 'administration', 1),
  ('role-hosp-dir', 'hospital_director', 'Hospital Director', 'administration', 1),
  ('role-branch-admin', 'branch_admin', 'Branch Administrator', 'administration', 1),
  ('role-hr-manager', 'hr_manager', 'HR Manager', 'hr', 1),
  ('role-finance-mgr', 'finance_manager', 'Finance Manager', 'finance', 1),
  ('role-ops-mgr', 'operations_manager', 'Operations Manager', 'administration', 1),
  ('role-doctor', 'doctor', 'Doctor', 'medical', 1),
  ('role-specialist', 'specialist', 'Specialist', 'medical', 1),
  ('role-surgeon', 'surgeon', 'Surgeon', 'medical', 1),
  ('role-dentist', 'dentist', 'Dentist', 'medical', 1),
  ('role-nurse', 'nurse', 'Nurse', 'nursing', 1),
  ('role-lab-tech', 'lab_technician', 'Lab Technician', 'laboratory', 1),
  ('role-radiologist', 'radiologist', 'Radiologist', 'radiology', 1),
  ('role-pharmacist', 'pharmacist', 'Pharmacist', 'pharmacy', 1),
  ('role-therapist', 'therapist', 'Therapist', 'medical', 1),
  ('role-nutritionist', 'nutritionist', 'Nutritionist', 'medical', 1),
  ('role-receptionist', 'receptionist', 'Receptionist', 'front_office', 1),
  ('role-appt-officer', 'appointment_officer', 'Appointment Officer', 'front_office', 1),
  ('role-reg-staff', 'registration_staff', 'Patient Registration Staff', 'front_office', 1),
  ('role-accountant', 'accountant', 'Accountant', 'finance', 1),
  ('role-billing-off', 'billing_officer', 'Billing Officer', 'finance', 1),
  ('role-insurance-off', 'insurance_officer', 'Insurance Officer', 'finance', 1),
  ('role-payroll-off', 'payroll_officer', 'Payroll Officer', 'finance', 1),
  ('role-inventory-mgr', 'inventory_manager', 'Inventory Manager', 'operations', 1),
  ('role-procurement', 'procurement_officer', 'Procurement Officer', 'operations', 1),
  ('role-it-admin', 'it_admin', 'IT Administrator', 'it', 1),
  ('role-patient', 'patient', 'Patient', 'patient', 1);

-- ============================================================
-- SEED DATA: System Config
-- ============================================================

INSERT OR IGNORE INTO system_config(key, value) VALUES
  ('db_version', '1.0.0'),
  ('system_name', 'AfyaCore HMS'),
  ('setup_complete', '0'),
  ('license_status', 'inactive'),
  ('current_branch_id', ''),
  ('sync_enabled', '0'),
  ('audit_retention_days', '2555'),
  ('session_timeout_minutes', '30'),
  ('max_failed_logins', '5'),
  ('lockout_duration_minutes', '15'),
  ('password_min_length', '8'),
  ('password_require_uppercase', '1'),
  ('password_require_numbers', '1'),
  ('password_require_symbols', '1'),
  ('password_expiry_days', '90'),
  ('mfa_required_roles', '["super_admin","hospital_director","finance_manager"]'),
  ('invoice_prefix', 'INV'),
  ('patient_prefix', 'AFC'),
  ('visit_prefix', 'VIS'),
  ('rx_prefix', 'RX'),
  ('lab_request_prefix', 'LAB'),
  ('po_prefix', 'PO'),
  ('currency', 'KES'),
  ('date_format', 'DD/MM/YYYY'),
  ('time_format', '24h');
