/**
 * Profile Controller - Component-based Architecture
 */
(function() {
    'use strict';

    angular
        .module('interviewPrepApp')
        .controller('ProfileController', ProfileController);

    ProfileController.$inject = ['$location', 'AuthService', 'UserService'];

    function ProfileController($location, AuthService, UserService) {
        var vm = this;

        // Properties
        vm.user = AuthService.getCurrentUser() || {};
        vm.activeTab = 'profile';
        vm.loading = false;
        vm.error = '';
        vm.success = '';

        // Profile form
        vm.profileForm = {
            name: vm.user.name || '',
            email: vm.user.email || '',
            experience_level: vm.user.experience_level || '',
            target_roles: vm.user.target_roles || []
        };

        // Password form
        vm.passwordForm = {
            current_password: '',
            new_password: '',
            confirm_password: ''
        };

        // Options
        vm.experienceLevels = [
            { value: 'beginner', label: 'Beginner (0-2 years)' },
            { value: 'intermediate', label: 'Intermediate (3-5 years)' },
            { value: 'senior', label: 'Senior (5-10 years)' },
            { value: 'expert', label: 'Expert (10+ years)' }
        ];

        vm.availableRoles = [
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
        vm.setActiveTab = setActiveTab;
        vm.updateProfile = updateProfile;
        vm.changePassword = changePassword;
        vm.toggleTargetRole = toggleTargetRole;
        vm.logout = logout;

        // Initialize
        activate();

        function activate() {
            if (!AuthService.isAuthenticated()) {
                $location.path('/login');
                return;
            }
        }

        function setActiveTab(tab) {
            vm.activeTab = tab;
            vm.error = '';
            vm.success = '';
        }

        function updateProfile() {
            vm.loading = true;
            vm.error = '';
            vm.success = '';

            // Validate form
            if (!vm.profileForm.name || !vm.profileForm.email) {
                vm.error = 'Name and email are required.';
                vm.loading = false;
                return;
            }

            // Email validation
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(vm.profileForm.email)) {
                vm.error = 'Please enter a valid email address.';
                vm.loading = false;
                return;
            }

            UserService.updateProfile(vm.profileForm)
                .then(function(response) {
                    vm.success = 'Profile updated successfully!';
                    // Update user data in AuthService
                    AuthService.updateUser(response);
                    vm.user = response;
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to update profile.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }

        function changePassword() {
            vm.loading = true;
            vm.error = '';
            vm.success = '';

            // Validate passwords
            if (!vm.passwordForm.current_password || !vm.passwordForm.new_password || !vm.passwordForm.confirm_password) {
                vm.error = 'All password fields are required.';
                vm.loading = false;
                return;
            }

            if (vm.passwordForm.new_password !== vm.passwordForm.confirm_password) {
                vm.error = 'New passwords do not match.';
                vm.loading = false;
                return;
            }

            if (vm.passwordForm.new_password.length < 8) {
                vm.error = 'New password must be at least 8 characters long.';
                vm.loading = false;
                return;
            }

            UserService.changePassword({
                old_password: vm.passwordForm.current_password,
                new_password: vm.passwordForm.new_password
            })
                .then(function(response) {
                    vm.success = 'Password changed successfully!';
                    // Clear password form
                    vm.passwordForm = {
                        current_password: '',
                        new_password: '',
                        confirm_password: ''
                    };
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to change password.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }

        function toggleTargetRole(role) {
            var index = vm.profileForm.target_roles.indexOf(role);
            if (index > -1) {
                vm.profileForm.target_roles.splice(index, 1);
            } else {
                vm.profileForm.target_roles.push(role);
            }
        }

        function logout() {
            if (confirm('Are you sure you want to logout?')) {
                AuthService.logout();
            }
        }
    }
})();