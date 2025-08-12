import requests
import sys
from datetime import datetime, timedelta
import json

class DebateClubAPITester:
    def __init__(self, base_url="https://debatemaster.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_debate_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API Endpoint", "GET", "", 200)

    def test_admin_login(self):
        """Test admin login with correct credentials"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "admin/login",
            200,
            data={"username": "admin", "password": "debateclub123"}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   Token obtained: {self.token[:20]}...")
            return True
        return False

    def test_admin_login_invalid(self):
        """Test admin login with invalid credentials"""
        return self.run_test(
            "Admin Login (Invalid)",
            "POST",
            "admin/login",
            401,
            data={"username": "admin", "password": "wrongpassword"}
        )

    def test_create_debate(self):
        """Create a test debate"""
        start_time = (datetime.now() + timedelta(hours=1)).isoformat()
        end_time = (datetime.now() + timedelta(hours=3)).isoformat()
        
        debate_data = {
            "title": "Should AI Replace Human Teachers?",
            "description": "A comprehensive debate on the role of AI in education",
            "topic": "Education and Technology",
            "start_time": start_time,
            "end_time": end_time,
            "status": "upcoming"
        }
        
        success, response = self.run_test(
            "Create Debate",
            "POST",
            "debates",
            200,
            data=debate_data
        )
        
        if success and 'id' in response:
            self.created_debate_id = response['id']
            print(f"   Created debate ID: {self.created_debate_id}")
            return True
        return False

    def test_get_debates(self):
        """Get all debates"""
        success, response = self.run_test(
            "Get All Debates",
            "GET",
            "debates",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} debates")
            return True
        return False

    def test_get_specific_debate(self):
        """Get specific debate by ID"""
        if not self.created_debate_id:
            print("❌ No debate ID available for testing")
            return False
            
        return self.run_test(
            "Get Specific Debate",
            "GET",
            f"debates/{self.created_debate_id}",
            200
        )

    def test_vote_on_debate(self):
        """Test voting on a debate"""
        if not self.created_debate_id:
            print("❌ No debate ID available for voting test")
            return False
            
        vote_data = {
            "debate_id": self.created_debate_id,
            "vote_type": "for",
            "voter_name": "TestVoter1"
        }
        
        return self.run_test(
            "Vote on Debate",
            "POST",
            "debates/vote",
            200,
            data=vote_data
        )

    def test_duplicate_vote(self):
        """Test duplicate voting (should fail)"""
        if not self.created_debate_id:
            print("❌ No debate ID available for duplicate vote test")
            return False
            
        vote_data = {
            "debate_id": self.created_debate_id,
            "vote_type": "against",
            "voter_name": "TestVoter1"  # Same voter name as before
        }
        
        return self.run_test(
            "Duplicate Vote (Should Fail)",
            "POST",
            "debates/vote",
            400,
            data=vote_data
        )

    def test_join_debate(self):
        """Test joining a debate"""
        if not self.created_debate_id:
            print("❌ No debate ID available for join test")
            return False
            
        join_data = {
            "debate_id": self.created_debate_id,
            "participant_name": "TestParticipant1"
        }
        
        return self.run_test(
            "Join Debate",
            "POST",
            "debates/join",
            200,
            data=join_data
        )

    def test_create_comment(self):
        """Test creating a comment"""
        if not self.created_debate_id:
            print("❌ No debate ID available for comment test")
            return False
            
        comment_data = {
            "debate_id": self.created_debate_id,
            "content": "This is a test comment on the debate.",
            "author_name": "TestCommenter1"
        }
        
        return self.run_test(
            "Create Comment",
            "POST",
            "comments",
            200,
            data=comment_data
        )

    def test_get_comments(self):
        """Test getting comments for a debate"""
        if not self.created_debate_id:
            print("❌ No debate ID available for get comments test")
            return False
            
        success, response = self.run_test(
            "Get Comments",
            "GET",
            f"comments/{self.created_debate_id}",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} comments")
            return True
        return False

    def test_unauthorized_create_debate(self):
        """Test creating debate without admin token"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        start_time = (datetime.now() + timedelta(hours=1)).isoformat()
        end_time = (datetime.now() + timedelta(hours=3)).isoformat()
        
        debate_data = {
            "title": "Unauthorized Test Debate",
            "description": "This should fail",
            "topic": "Test Topic",
            "start_time": start_time,
            "end_time": end_time,
            "status": "upcoming"
        }
        
        success, _ = self.run_test(
            "Create Debate (Unauthorized)",
            "POST",
            "debates",
            401,
            data=debate_data
        )
        
        # Restore token
        self.token = original_token
        return success

def main():
    print("🚀 Starting Debate Club API Tests")
    print("=" * 50)
    
    tester = DebateClubAPITester()
    
    # Test sequence
    tests = [
        tester.test_root_endpoint,
        tester.test_admin_login_invalid,
        tester.test_admin_login,
        tester.test_unauthorized_create_debate,
        tester.test_create_debate,
        tester.test_get_debates,
        tester.test_get_specific_debate,
        tester.test_vote_on_debate,
        tester.test_duplicate_vote,
        tester.test_join_debate,
        tester.test_create_comment,
        tester.test_get_comments,
    ]
    
    # Run all tests
    for test in tests:
        try:
            test()
        except Exception as e:
            print(f"❌ Test failed with exception: {str(e)}")
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())