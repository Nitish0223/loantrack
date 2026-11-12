-- 002: sample data so the app shows rows on first start.
-- Runs after 001 because init scripts execute in filename order.

INSERT INTO loans (borrower_name, loan_amount, property_city, status) VALUES
    ('Aarav Sharma',    2500000.00, 'Bengaluru', 'APPROVED'),
    ('Priya Nair',      1850000.00, 'Mumbai',    'PENDING'),
    ('Rohan Verma',     3200000.00, 'Pune',      'FUNDED'),
    ('Ananya Iyer',      975000.50, 'Chennai',   'PENDING'),
    ('Kabir Singh',     4100000.00, 'Gurugram',  'REJECTED'),
    ('Meera Kulkarni',  1500000.00, 'Hyderabad', 'APPROVED');
