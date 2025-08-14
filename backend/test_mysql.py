import pymysql
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_mysql_connection():
    """Test MySQL connection using the DATABASE_URL from .env"""
    try:
        # Get database URL from environment
        db_url = os.getenv('DATABASE_URL', '')
        print(f"Testing connection to: {db_url}")
        
        if not db_url:
            print("❌ DATABASE_URL not found in .env file")
            return False
            
        # Parse the connection string
        # Format: mysql+pymysql://username:password@host:port/database
        if db_url.startswith('mysql+pymysql://'):
            connection_string = db_url.replace('mysql+pymysql://', '')
            if '@' in connection_string:
                credentials, rest = connection_string.split('@')
                username, password = credentials.split(':')
                host_port_db = rest.split('/')
                host_port = host_port_db[0]
                database = host_port_db[1] if len(host_port_db) > 1 else None
                
                if ':' in host_port:
                    host, port = host_port.split(':')
                    port = int(port)
                else:
                    host = host_port
                    port = 3306
                
                print(f"Connecting to MySQL:")
                print(f"  Host: {host}")
                print(f"  Port: {port}")
                print(f"  Username: {username}")
                print(f"  Database: {database}")
                
                # Test connection
                connection = pymysql.connect(
                    host=host,
                    port=port,
                    user=username,
                    password=password,
                    database=database
                )
                
                print("✅ MySQL connection successful!")
                
                # Test creating a table
                with connection.cursor() as cursor:
                    cursor.execute("SELECT VERSION()")
                    version = cursor.fetchone()
                    print(f"MySQL Version: {version[0]}")
                
                connection.close()
                return True
                
            else:
                print("❌ Invalid DATABASE_URL format")
                return False
        else:
            print("❌ DATABASE_URL should start with 'mysql+pymysql://'")
            return False
            
    except Exception as e:
        print(f"❌ MySQL connection failed: {e}")
        return False

if __name__ == "__main__":
    print("Testing MySQL connection...")
    success = test_mysql_connection()
    
    if success:
        print("\n🎉 MySQL is working! You can now start your backend.")
    else:
        print("\n💡 To fix this:")
        print("1. Check your MySQL Workbench connection details")
        print("2. Update your .env file with correct DATABASE_URL")
        print("3. Make sure MySQL service is running")
        print("4. Create the 'interview_prep_db' database in MySQL Workbench")
