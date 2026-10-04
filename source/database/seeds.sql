USE lab_data_management;

INSERT INTO users (id, email, display_name, role)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'admin@local.test', 'Local System Administrator', 'SYSTEM_ADMIN'),
  ('00000000-0000-4000-8000-000000000002', 'member@local.test', 'Local Lab Member', 'LAB_MEMBER')
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  role = VALUES(role),
  is_active = TRUE;

INSERT INTO resources (
  id, name, category, location, description, responsible_person,
  availability_status, current_status, specifications, archived
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'Confocal Microscope',
  'Instruments',
  'Imaging Lab, Room 204',
  'Shared confocal microscope for fluorescence imaging.',
  'Dr. Example',
  'AVAILABLE',
  'OPERATIONAL',
  'Laser lines: 405 nm, 488 nm, 561 nm',
  FALSE
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  location = VALUES(location),
  availability_status = VALUES(availability_status),
  current_status = VALUES(current_status),
  archived = FALSE;

INSERT INTO bookings (
  id, resource_id, requester_id, start_time, end_time, status
)
VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 2 DAY),
    DATE_ADD(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 2 DAY), INTERVAL 2 HOUR),
    'PENDING'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 DAY),
    DATE_ADD(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 DAY), INTERVAL 3 HOUR),
    'PENDING'
  )
ON DUPLICATE KEY UPDATE id = VALUES(id);
