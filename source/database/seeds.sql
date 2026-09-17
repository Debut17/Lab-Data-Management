USE lab_data_management;

INSERT INTO users (id, email, display_name, role)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'admin@local.test', 'Local System Administrator', 'SYSTEM_ADMIN'),
  ('00000000-0000-4000-8000-000000000002', 'member@local.test', 'Local Lab Member', 'LAB_MEMBER')
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  role = VALUES(role),
  is_active = TRUE;
