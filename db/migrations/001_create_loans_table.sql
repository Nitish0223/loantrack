-- 001: create the loans table.
-- Applied automatically on the database's first start: the files are placed in
-- /docker-entrypoint-initdb.d, which the postgres image runs in filename order
-- when the data directory is empty. The numeric prefix fixes that order.

CREATE TABLE IF NOT EXISTS loans (
    id            SERIAL PRIMARY KEY,
    borrower_name TEXT          NOT NULL,
    loan_amount   NUMERIC(14,2) NOT NULL CHECK (loan_amount > 0),
    property_city TEXT,
    status        TEXT          NOT NULL DEFAULT 'PENDING',
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
