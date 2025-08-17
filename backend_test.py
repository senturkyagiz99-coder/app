import requests
import sys
from datetime import datetime, timedelta
import json
import io
import os

class DebateClubAPITester:
    def __init__(self, base_url="https://801f5720-a5b2-4d01-b6a4-ac433b5f417e.preview.emergentagent.com"):
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
        """Test root API endpoint - should return 'Münazara Kulübü API'si'"""
        success, response = self.run_test("Root API Endpoint", "GET", "", 200)
        if success and 'message' in response:
            expected_message = "Münazara Kulübü API'si"
            if response['message'] == expected_message:
                print(f"   ✅ Correct API name: {response['message']}")
                return True
            else:
                print(f"   ❌ Wrong API name: {response['message']} (expected: {expected_message})")
                return False
        return success

    def test_admin_login(self):
        """Test admin login with NEW credentials"""
        success, response = self.run_test(
            "Admin Login (New Credentials)",
            "POST",
            "admin/login",
            200,
            data={"username": "debateclub2025", "password": "onlinedebate"}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   Token obtained: {self.token[:20]}...")
            return True
        return False

    def test_old_admin_login(self):
        """Test old admin login should fail"""
        return self.run_test(
            "Old Admin Login (Should Fail)",
            "POST",
            "admin/login",
            401,
            data={"username": "admin", "password": "debateclub123"}
        )

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
        
        success, response = self.run_test(
            "Duplicate Vote (Should Fail - Turkish Error)",
            "POST",
            "debates/vote",
            400,
            data=vote_data
        )
        
        # Check if error message is in Turkish and mentions "münazara"
        if success and 'detail' in response:
            expected_error = "Bu münazarada zaten oy kullandınız"
            if response['detail'] == expected_error:
                print(f"   ✅ Correct Turkish error message: {response['detail']}")
                return True
            else:
                print(f"   ❌ Wrong error message: {response['detail']} (expected: {expected_error})")
                return False
        return success

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

    def test_get_payment_packages(self):
        """Test getting payment packages - Turkish Lira verification"""
        success, response = self.run_test(
            "Get Payment Packages (Turkish Lira)",
            "GET",
            "payments/packages",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Found {len(response)} payment packages")
            
            # Expected Turkish Lira amounts
            expected_packages = {
                'membership_monthly': 850.0,
                'membership_yearly': 8500.0,
                'event_registration': 500.0,
                'donation_small': 350.0,
                'donation_medium': 1750.0,
                'donation_large': 3500.0
            }
            
            all_correct = True
            for package, expected_amount in expected_packages.items():
                if package in response:
                    actual_amount = response[package]['amount']
                    if actual_amount == expected_amount:
                        print(f"   ✅ Package '{package}': ₺{actual_amount} (correct)")
                    else:
                        print(f"   ❌ Package '{package}': ₺{actual_amount} (expected ₺{expected_amount})")
                        all_correct = False
                else:
                    print(f"   ❌ Missing package: {package}")
                    all_correct = False
            
            return all_correct
        return False

    def test_get_photos(self):
        """Test getting photos"""
        success, response = self.run_test(
            "Get Photos",
            "GET",
            "photos",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} photos")
            return True
        return False

    def test_photo_upload_unauthorized(self):
        """Test photo upload without admin token"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        # Create a simple test image file
        test_image_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\nIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {'file': ('test.png', io.BytesIO(test_image_data), 'image/png')}
        data = {
            'title': 'Test Photo',
            'description': 'Test Description',
            'event_date': '2025-01-01'
        }
        
        url = f"{self.api_url}/photos/upload"
        headers = {}
        
        self.tests_run += 1
        print(f"\n🔍 Testing Photo Upload (Unauthorized)...")
        
        try:
            response = requests.post(url, files=files, data=data, headers=headers, timeout=10)
            success = response.status_code == 401
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
            else:
                print(f"❌ Failed - Expected 401, got {response.status_code}")
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            success = False
        
        # Restore token
        self.token = original_token
        return success

    def test_photo_upload_authorized(self):
        """Test photo upload with admin token"""
        if not self.token:
            print("❌ No admin token available for photo upload test")
            return False
            
        # Create a simple test image file
        test_image_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\nIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {'file': ('test.png', io.BytesIO(test_image_data), 'image/png')}
        data = {
            'title': 'Test Photo Upload',
            'description': 'Test photo description for API testing',
            'event_date': '2025-01-15'
        }
        
        url = f"{self.api_url}/photos/upload"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing Photo Upload (Authorized)...")
        
        try:
            response = requests.post(url, files=files, data=data, headers=headers, timeout=10)
            success = response.status_code == 200
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
        
        return False

    def test_payment_session_unauthorized(self):
        """Test payment session creation without admin token"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        payment_data = {
            "payment_type": "membership_monthly",
            "member_name": "Test User"
        }
        
        success, _ = self.run_test(
            "Create Payment Session (Unauthorized)",
            "POST",
            "payments/checkout/session",
            401,
            data=payment_data
        )
        
        # Restore token
        self.token = original_token
        return success

    def test_payment_session_authorized(self):
        """Test payment session creation with admin token - Turkish Lira verification"""
        if not self.token:
            print("❌ No admin token available for payment session test")
            return False
            
        # Test different payment types
        payment_tests = [
            {
                "payment_type": "membership_monthly",
                "member_name": "Test User Monthly",
                "expected_amount": 850.0
            },
            {
                "payment_type": "donation_large", 
                "member_name": "Test User Donation",
                "expected_amount": 3500.0
            },
            {
                "payment_type": "donation",
                "amount": 1250.0,
                "member_name": "Test User Custom",
                "expected_amount": 1250.0
            }
        ]
        
        all_passed = True
        for i, payment_data in enumerate(payment_tests):
            test_name = f"Create Payment Session #{i+1} ({payment_data['payment_type']})"
            success, response = self.run_test(
                test_name,
                "POST",
                "payments/checkout/session",
                200,
                data=payment_data
            )
            
            if success and 'session_id' in response and 'url' in response:
                print(f"   ✅ Session ID: {response['session_id']}")
                print(f"   ✅ Checkout URL: {response['url'][:50]}...")
                
                # Verify the session was created with correct currency
                session_id = response['session_id']
                status_success, status_response = self.run_test(
                    f"Check Payment Status #{i+1}",
                    "GET",
                    f"payments/checkout/status/{session_id}",
                    200
                )
                
                if status_success:
                    currency = status_response.get('currency', '').lower()
                    amount = status_response.get('amount', 0)
                    if currency == 'try':
                        print(f"   ✅ Currency: {currency.upper()} (correct)")
                    else:
                        print(f"   ❌ Currency: {currency.upper()} (expected TRY)")
                        all_passed = False
                    
                    if amount == payment_data['expected_amount']:
                        print(f"   ✅ Amount: ₺{amount} (correct)")
                    else:
                        print(f"   ❌ Amount: ₺{amount} (expected ₺{payment_data['expected_amount']})")
                        all_passed = False
                else:
                    all_passed = False
            else:
                all_passed = False
        
        return all_passed

    def test_payment_transactions_unauthorized(self):
        """Test getting payment transactions without admin token"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        success, _ = self.run_test(
            "Get Payment Transactions (Unauthorized)",
            "GET",
            "payments/transactions",
            401
        )
        
        # Restore token
        self.token = original_token
        return success

    def test_payment_transactions_authorized(self):
        """Test getting payment transactions with admin token"""
        if not self.token:
            print("❌ No admin token available for payment transactions test")
            return False
            
        success, response = self.run_test(
            "Get Payment Transactions (Authorized)",
            "GET",
            "payments/transactions",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} payment transactions")
            return True
        return False

    def test_notification_subscribe(self):
        """Test push notification subscription"""
        subscription_data = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint-123",
            "keys": {
                "p256dh": "test-p256dh-key",
                "auth": "test-auth-key"
            }
        }
        
        success, response = self.run_test(
            "Push Notification Subscribe",
            "POST",
            "notifications/subscribe",
            200,
            data=subscription_data
        )
        
        if success and 'message' in response:
            expected_messages = ["Bildirim aboneliği başarıyla oluşturuldu", "Zaten abone olunmuş"]
            if response['message'] in expected_messages:
                print(f"   ✅ Turkish message: {response['message']}")
                return True
            else:
                print(f"   ❌ Unexpected message: {response['message']}")
                return False
        return False

    def test_notification_unsubscribe(self):
        """Test push notification unsubscription"""
        endpoint = "https://fcm.googleapis.com/fcm/send/test-endpoint-123"
        
        success, response = self.run_test(
            "Push Notification Unsubscribe",
            "DELETE",
            f"notifications/unsubscribe/{endpoint}",
            200
        )
        
        if success and 'message' in response:
            expected_messages = ["Bildirim aboneliği iptal edildi", "Abonelik bulunamadı"]
            if response['message'] in expected_messages:
                print(f"   ✅ Turkish message: {response['message']}")
                return True
            else:
                print(f"   ❌ Unexpected message: {response['message']}")
                return False
        return False

    def test_notification_send_unauthorized(self):
        """Test manual notification sending without admin token"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        notification_data = {
            "title": "Test Notification",
            "body": "This is a test notification",
            "icon": "/icon-192x192.png",
            "url": "/"
        }
        
        success, _ = self.run_test(
            "Send Manual Notification (Unauthorized)",
            "POST",
            "notifications/send",
            401,
            data=notification_data
        )
        
        # Restore token
        self.token = original_token
        return success

    def test_notification_send_authorized(self):
        """Test manual notification sending with admin token"""
        if not self.token:
            print("❌ No admin token available for notification send test")
            return False
            
        notification_data = {
            "title": "Test Bildirim",
            "body": "Bu bir test bildirimidir",
            "icon": "/icon-192x192.png",
            "url": "/"
        }
        
        success, response = self.run_test(
            "Send Manual Notification (Authorized)",
            "POST",
            "notifications/send",
            200,
            data=notification_data
        )
        
        if success and 'message' in response:
            if response['message'] == "Bildirim gönderildi":
                print(f"   ✅ Turkish message: {response['message']}")
                return True
            else:
                print(f"   ❌ Unexpected message: {response['message']}")
                return False
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
        # Photo and payment tests
        tester.test_get_payment_packages,
        tester.test_get_photos,
        tester.test_photo_upload_unauthorized,
        tester.test_photo_upload_authorized,
        tester.test_payment_session_unauthorized,
        tester.test_payment_session_authorized,
        tester.test_payment_transactions_unauthorized,
        tester.test_payment_transactions_authorized,
        # Notification system tests
        tester.test_notification_subscribe,
        tester.test_notification_unsubscribe,
        tester.test_notification_send_unauthorized,
        tester.test_notification_send_authorized,
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