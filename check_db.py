import psycopg2

conn = psycopg2.connect('postgres://odak_posta_user:8X1l2r1NfXpYvN8jG6b3F8Z1Xp2J5r9C@dpg-cqlh521qf0us73dbclc0-a.frankfurt-postgres.render.com/odak_posta?sslmode=require')
cur = conn.cursor()

# Check what rows exist
cur.execute("SELECT id, email, username, username_key FROM app_users WHERE email = 'yusufalperguelden@gmail.com' OR username = 'yusufalperguelden@gmail.com' OR username_key = 'yusufalperguelden@gmail.com'")
rows = cur.fetchall()
print('Found rows:')
for row in rows:
    print(row)
    
# Delete the rows
cur.execute("DELETE FROM app_users WHERE email = 'yusufalperguelden@gmail.com' OR username = 'yusufalperguelden@gmail.com' OR username_key = 'yusufalperguelden@gmail.com'")
conn.commit()

print(f'Deleted {cur.rowcount} rows.')

cur.close()
conn.close()
