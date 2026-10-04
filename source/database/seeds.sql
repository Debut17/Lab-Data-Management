USE lab_data_management;

INSERT INTO users (id, email, display_name, role)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'admin@local.test', 'Local System Administrator', 'SYSTEM_ADMIN'),
  ('00000000-0000-4000-8000-000000000002', 'member@local.test', 'Local Lab Member', 'LAB_MEMBER')
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  role = VALUES(role),
  is_active = TRUE;

//Added Iteration 3
INSERT INTO resources (
  id, name, category, location, description, responsible_person,
  availability_status, current_status, specifications, archived
)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'BX53 Upright Microscope',
    'Microscope',
    'Biology Lab A, Room 201',
    'Upright microscope for laboratory observation.',
    'Dr. Example',
    'AVAILABLE',
    'OPERATIONAL',
    'LED illumination; brightfield observation',
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'High-Speed Centrifuge',
    'Centrifuge',
    'Chemistry Lab, Room 105',
    'Refrigerated centrifuge for sample preparation.',
    'Lab Operations Team',
    'AVAILABLE',
    'OPERATIONAL',
    'Maximum speed: 15,000 rpm',
    FALSE
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  location = VALUES(location),
  description = VALUES(description),
  responsible_person = VALUES(responsible_person),
  availability_status = VALUES(availability_status),
  current_status = VALUES(current_status),
  specifications = VALUES(specifications),
  archived = VALUES(archived);
