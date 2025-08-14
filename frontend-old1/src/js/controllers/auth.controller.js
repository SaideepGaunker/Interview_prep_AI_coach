/**
 * Authentication Controller for login and registration
 */
(function() {
    'use strict';

    angular
        .module('interviewPrepApp')
        .controller('AuthController', AuthController);

    AuthController.$inject = ['$location', '$routeParams', '$timeout', 'AuthService'];

    function AuthController($location, $routeParams, $timeout, AuthService) {
        var vm = this;
        
        // Properties
        vm.isLogin = $location.path() === '/login';
        vm.isRegister = $location.path() === '/register';
        vm.loading = false;
        vm.error = '';
        vm.success = '';
        
        // Login form
        vm.loginForm = {
            email: '',
            password: ''
        };
        
        // Registration form
        vm.registerForm = {
            email: '',
            password: '',
            confirmPassword: '',
            name: '',
            role: 'job_seeker',
            target_roles: [],
            experience_level: 'beginner'
        };
        
        // Password reset form
        vm.resetForm = {
            email: '',
            token: $routeParams.token || '',
            newPassword: '',
            confirmPassword: ''
        };
        
        // Available options
        vm.roles = [
            { value: 'job_seeker', label: 'Job Seeker' },
            { value: 'student', label: 'Student' },
            { value: 'admin', label: 'Administrator' }
        ];
        
        vm.experienceLevels = [
            { value: 'beginner', label: 'Beginner (0-2 years)' },
            { value: 'intermediate', label: 'Intermediate (2-5 years)' },
            { value: 'experienced', label: 'Experienced (5+ years)' }
        ];
        
        vm.targetRoleOptions = [
            'Software Developer',
            'Data Scientist',
            'Product Manager',
            'Marketing Manager',
            'Sales Representative',
            'Business Analyst',
            'UI/UX Designer',
            'DevOps Engineer',
            'Project Manager',
            'Consultant'
        ];
        
        // Methods
        vm.login = login;
        vm.register = register;
        vm.forgotPassword = forgotPassword;
        vm.resetPassword = resetPassword;
        vm.toggleTargetRole = toggleTargetRole;
        vm.validateForm = validateForm;
        vm.testRedirect = testRedirect;
        
        // Initialize
        activate();
        
        function activate() {
            // Check if user is already logged in
            if (AuthService.isAuthenticated()) {
                $location.path('/dashboard');
            }
        }
        
        function login() {
            vm.error = '';
            vm.loading = true;
            
            if (!validateLoginForm()) {
                vm.loading = false;
                return;
            }
            
            AuthService.login(vm.loginForm)
                .then(function(response) {
                    console.log('Login successful:', response);
                    vm.success = 'Login successful! Redirecting...';
                    // Use $timeout for better Angular integration
                    $timeout(function() {
                        console.log('Redirecting to dashboard...');
                        try {
                            $location.path('/dashboard');
                            // Fallback to window.location if $location doesn't work
                            setTimeout(function() {
                                if ($location.path() !== '/dashboard') {
                                    console.log('$location failed, using window.location fallback');
                                    window.location.href = '#!/dashboard';
                                }
                            }, 500);
                        } catch (e) {
                            console.error('$location error:', e);
                            window.location.href = '#!/dashboard';
                        }
                    }, 1500);
                })
                .catch(function(error) {
                    console.error('Login error:', error);
                    vm.error = error.data?.detail || 'Login failed. Please try again.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function register() {
            vm.error = '';
            vm.loading = true;
            
            if (!validateRegisterForm()) {
                vm.loading = false;
                return;
            }
            
            AuthService.register(vm.registerForm)
                .then(function(response) {
                    console.log('Registration successful:', response);
                    vm.success = 'Registration successful! Please check your email for verification. Redirecting to login...';
                    // Clear form
                    vm.registerForm = {
                        email: '',
                        password: '',
                        confirmPassword: '',
                        name: '',
                        role: 'job_seeker',
                        target_roles: [],
                        experience_level: 'beginner'
                    };
                    
                    // Redirect to login page after 2 seconds
                    $timeout(function() {
                        console.log('Redirecting to login...');
                        try {
                            $location.path('/login');
                            // Fallback to window.location if $location doesn't work
                            setTimeout(function() {
                                if ($location.path() !== '/login') {
                                    console.log('$location failed, using window.location fallback');
                                    window.location.href = '#!/login';
                                }
                            }, 500);
                        } catch (e) {
                            console.error('$location error:', e);
                            window.location.href = '#!/login';
                        }
                    }, 2000);
                })
                .catch(function(error) {
                    console.error('Registration error:', error);
                    vm.error = error.data?.detail || 'Registration failed. Please try again.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function forgotPassword() {
            vm.error = '';
            vm.loading = true;
            
            if (!vm.resetForm.email) {
                vm.error = 'Please enter your email address.';
                vm.loading = false;
                return;
            }
            
            AuthService.forgotPassword(vm.resetForm.email)
                .then(function(response) {
                    vm.success = 'Password reset instructions sent to your email.';
                    vm.resetForm.email = '';
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to send reset email.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function resetPassword() {
            vm.error = '';
            vm.loading = true;
            
            if (!validateResetForm()) {
                vm.loading = false;
                return;
            }
            
            AuthService.resetPassword(vm.resetForm.token, vm.resetForm.newPassword)
                .then(function(response) {
                    vm.success = 'Password reset successful! You can now login.';
                    setTimeout(function() {
                        $location.path('/login');
                    }, 2000);
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Password reset failed.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function toggleTargetRole(role) {
            var index = vm.registerForm.target_roles.indexOf(role);
            if (index > -1) {
                vm.registerForm.target_roles.splice(index, 1);
            } else {
                vm.registerForm.target_roles.push(role);
            }
        }
        
        function validateLoginForm() {
            if (!vm.loginForm.email) {
                vm.error = 'Email is required.';
                return false;
            }
            
            if (!vm.loginForm.password) {
                vm.error = 'Password is required.';
                return false;
            }
            
            return true;
        }
        
        function validateRegisterForm() {
            if (!vm.registerForm.name) {
                vm.error = 'Name is required.';
                return false;
            }
            
            if (!vm.registerForm.email) {
                vm.error = 'Email is required.';
                return false;
            }
            
            if (!isValidEmail(vm.registerForm.email)) {
                vm.error = 'Please enter a valid email address.';
                return false;
            }
            
            if (!vm.registerForm.password) {
                vm.error = 'Password is required.';
                return false;
            }
            
            if (vm.registerForm.password.length < 8) {
                vm.error = 'Password must be at least 8 characters long.';
                return false;
            }
            
            if (vm.registerForm.password !== vm.registerForm.confirmPassword) {
                vm.error = 'Passwords do not match.';
                return false;
            }
            
            if (!validatePasswordStrength(vm.registerForm.password)) {
                vm.error = 'Password must contain at least one uppercase letter, one lowercase letter, and one number.';
                return false;
            }
            
            return true;
        }
        
        function validateResetForm() {
            if (!vm.resetForm.token) {
                vm.error = 'Reset token is required.';
                return false;
            }
            
            if (!vm.resetForm.newPassword) {
                vm.error = 'New password is required.';
                return false;
            }
            
            if (vm.resetForm.newPassword.length < 8) {
                vm.error = 'Password must be at least 8 characters long.';
                return false;
            }
            
            if (vm.resetForm.newPassword !== vm.resetForm.confirmPassword) {
                vm.error = 'Passwords do not match.';
                return false;
            }
            
            if (!validatePasswordStrength(vm.resetForm.newPassword)) {
                vm.error = 'Password must contain at least one uppercase letter, one lowercase letter, and one number.';
                return false;
            }
            
            return true;
        }
        
        function validateForm() {
            if (vm.isLogin) {
                return validateLoginForm();
            } else if (vm.isRegister) {
                return validateRegisterForm();
            }
            return true;
        }
        
        function isValidEmail(email) {
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        }
        
        function validatePasswordStrength(password) {
            var hasUpper = /[A-Z]/.test(password);
            var hasLower = /[a-z]/.test(password);
            var hasNumber = /\d/.test(password);
            return hasUpper && hasLower && hasNumber;
        }
        
        function testRedirect() {
            console.log('Testing manual redirect to dashboard...');
            try {
                $location.path('/dashboard');
                // Fallback to window.location if $location doesn't work
                setTimeout(function() {
                    if ($location.path() !== '/dashboard') {
                        console.log('$location failed, using window.location fallback');
                        window.location.href = '#!/dashboard';
                    }
                }, 500);
            } catch (e) {
                console.error('$location error:', e);
                window.location.href = '#!/dashboard';
            }
        }
    }
})();