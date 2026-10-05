-- Apex Park — facility schema
-- Written to be portable across MySQL 8 and MariaDB 10.4+, which is what the
-- local development machine actually runs.

CREATE TABLE IF NOT EXISTS facility (
  id              TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  name            VARCHAR(80)  NOT NULL,
  city            VARCHAR(80)  NOT NULL,
  currency        CHAR(3)      NOT NULL DEFAULT 'ZAR',
  timezone        VARCHAR(48)  NOT NULL DEFAULT 'Africa/Johannesburg',
  CONSTRAINT facility_single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  phone_number  VARCHAR(32)  NULL,
  email         VARCHAR(160) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  number_plate  VARCHAR(16)  NOT NULL,
  type          ENUM('car','suv','truck','motorbike') NOT NULL DEFAULT 'car',
  user_id       BIGINT UNSIGNED NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vehicles_plate (number_plate),
  KEY idx_vehicles_user (user_id),
  CONSTRAINT fk_vehicles_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parking_spaces (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  space_number  VARCHAR(8)   NOT NULL,
  section       CHAR(1)      NOT NULL,
  ordinal       SMALLINT UNSIGNED NOT NULL,
  type          ENUM('car','suv','truck','motorbike') NOT NULL DEFAULT 'car',
  status        ENUM('available','occupied','reserved') NOT NULL DEFAULT 'available',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_spaces_number (space_number),
  KEY idx_spaces_status (status),
  KEY idx_spaces_section (section)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pricing_rules (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vehicle_type          ENUM('car','suv','truck','motorbike') NOT NULL,
  label                 VARCHAR(60) NOT NULL,
  grace_period_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  hourly_rate           DECIMAL(10,2) NOT NULL,
  daily_maximum         DECIMAL(10,2) NOT NULL,
  currency              CHAR(3)      NOT NULL DEFAULT 'ZAR',
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pricing_vehicle (vehicle_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parking_sessions (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vehicle_id        BIGINT UNSIGNED NOT NULL,
  parking_space_id  BIGINT UNSIGNED NOT NULL,
  check_in_time     DATETIME      NOT NULL,
  check_out_time    DATETIME      NULL,
  status            ENUM('active','completed') NOT NULL DEFAULT 'active',
  fee               DECIMAL(10,2) NULL,
  -- Set when a stay breaches its daily maximum. The session is still 'active',
  -- because the car has not left: it is an enforcement candidate, and it is
  -- explicitly excluded from simulator turnover so a demo always has one.
  is_overstay       TINYINT(1)    NOT NULL DEFAULT 0,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sessions_status (status),
  KEY idx_sessions_overstay (is_overstay, status),
  KEY idx_sessions_space (parking_space_id, status),
  KEY idx_sessions_vehicle (vehicle_id),
  KEY idx_sessions_checkin (check_in_time),
  CONSTRAINT fk_sessions_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id),
  CONSTRAINT fk_sessions_space   FOREIGN KEY (parking_space_id) REFERENCES parking_spaces (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id  BIGINT UNSIGNED NOT NULL,
  amount      DECIMAL(10,2) NOT NULL,
  method      ENUM('card','cash') NOT NULL DEFAULT 'card',
  status      ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  reference   VARCHAR(32)  NOT NULL,
  paid_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_reference (reference),
  -- A session is settled exactly once. Enforcing it here means a double
  -- checkout can never mint a second payment, whatever the calling code does.
  UNIQUE KEY uq_payments_session (session_id),
  KEY idx_payments_paid (paid_at),
  CONSTRAINT fk_payments_session FOREIGN KEY (session_id) REFERENCES parking_sessions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rolling occupancy samples. The analytics endpoint reads straight from here
-- instead of trying to reconstruct history from session timestamps.
CREATE TABLE IF NOT EXISTS occupancy_snapshots (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recorded_at    DATETIME     NOT NULL,
  occupied       SMALLINT UNSIGNED NOT NULL,
  total          SMALLINT UNSIGNED NOT NULL,
  revenue_today  DECIMAL(12,2) NOT NULL DEFAULT 0,
  KEY idx_snapshots_recorded (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;