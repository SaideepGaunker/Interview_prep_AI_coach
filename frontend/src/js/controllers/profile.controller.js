/**
 * Profile Controller for user profile management
 */
(function() {
    'use strict';

    angular
        .module('interviewPrepApp')
        .controller('ProfileController', ProfileController);

    ProfileController.$inject = ['$location', 'AuthService', 'ApiService'];

    function ProfileController($location, AuthService, ApiService) {
        var vm = this;
        
        // Properties
        vm.user = AuthService.getCurrentUser();
        vm.loading = false;
        vm.saving = false;
        vm.error = '';
        vm.success = '';
        vm.activeTab = 'profile';
        
        // Profile form
        vm.profileForm = {
            name: vm.user.name,
            target_roles: vm.user.target_roles || [],
            experience_level: vm.user.experience_level || 'beginner'
        };
        
        // Password change form
        vm.passwordForm = {
            old_password: '',
            new_password: '',
            confirm_password: ''
        };
        
        // Settings form
        vm.settingsForm = {
            email_notifications: true,
            privacy_settings: {
                profile_visibility: 'private',
                data_sharing: false
            }
        };
        
        // Available options
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
        vm.setActiveTab = setActiveTab;
        vm.updateProfile = updateProfile;
        vm.changePassword = changePassword;
        vm.updateSettings = updateSettings;
        vm.exportData = exportData;
        vm.deleteAccount = deleteAccount;
        vm.logout = logout;
        vm.toggleTargetRole = toggleTargetRole;
        vm.validatePasswordForm = validatePasswordForm;
        
        // Initialize
        activate();
        
        function activate() {
            loadUserSettings();
        }
        
        function loadUserSettings() {
            vm.loading = true;
            
            ApiService.get('/users/settings')
                .then(function(response) {
                    vm.settingsForm = angular.merge(vm.settingsForm, response);
                })
                .catch(function(error) {
                    console.error('Failed to load settings:', error);
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function setActiveTab(tab) {
            vm.activeTab = tab;
            vm.error = '';
            vm.success = '';
        }
        
        function updateProfile() {
            vm.error = '';
            vm.success = '';
            vm.saving = true;
            
            if (!vm.profileForm.name) {
                vm.error = 'Name is required.';
                vm.saving = false;
                return;
            }
            
            ApiService.put('/users/profile', vm.profileForm)
                .then(function(response) {
                    vm.success = 'Profile updated successfully!';
                    // Update local user data
                    var updatedUser = AuthService.getCurrentUser();
                    updatedUser.name = vm.profileForm.name;
                    updatedUser.target_roles = vm.profileForm.target_roles;
                    updatedUser.experience_level = vm.profileForm.experience_level;
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to update profile.';
                })
                .finally(function() {
                    vm.saving = false;
                });
        }
        
        function changePassword() {
            vm.error = '';
            vm.success = '';
            vm.saving = true;
            
            if (!validatePasswordForm()) {
                vm.saving = false;
                return;
            }
            
            ApiService.post('/users/change-password', {
                old_password: vm.passwordForm.old_password,
                new_password: vm.passwordForm.new_password
            })
                .then(function(response) {
                    vm.success = 'Password changed successfully!';
                    // Clear form
                    vm.passwordForm = {
                        old_password: '',
                        new_password: '',
                        confirm_password: ''
                    };
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to change password.';
                })
                .finally(function() {
                    vm.saving = false;
                });
        }
        
        function updateSettings() {
            vm.error = '';
            vm.success = '';
            vm.saving = true;
            
            ApiService.put('/users/settings', vm.settingsForm)
                .then(function(response) {
                    vm.success = 'Settings updated successfully!';
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to update settings.';
                })
                .finally(function() {
                    vm.saving = false;
                });
        }
        
        function exportData() {
            vm.loading = true;
            
            ApiService.get('/users/export-data')
                .then(function(response) {
                    // Create and download file
                    var dataStr = JSON.stringify(response.data, null, 2);
                    var dataBlob = new Blob([dataStr], {type: 'application/json'});
                    var url = URL.createObjectURL(dataBlob);
                    var link = document.createElement('a');
                    link.href = url;
                    link.download = 'my-interview-prep-data.json';
                    link.click();
                    URL.revokeObjectURL(url);
                    
                    vm.success = 'Data exported successfully!';
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to export data.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function deleteAccount() {
            if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                return;
            }
            
            if (!confirm('This will permanently delete all your data. Are you absolutely sure?')) {
                return;
            }
            
            vm.loading = true;
            
            ApiService.delete('/users/profile')
                .then(function(response) {
                    alert('Account deleted successfully. You will be redirected to the home page.');
                    AuthService.logout();
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to delete account.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function logout() {
            if (confirm('Are you sure you want to logout?')) {
                AuthService.logout();
            }
        }
        
        function toggleTargetRole(role) {
            var index = vm.profileForm.target_roles.indexOf(role);
            if (index > -1) {
                vm.profileForm.target_roles.splice(index, 1);
            } else {
                vm.profileForm.target_roles.push(role);
            }
        }
        
        function validatePasswordForm() {
            if (!vm.passwordForm.old_password) {
                vm.error = 'Current password is required.';
                return false;
            }
            
            if (!vm.passwordForm.new_password) {
                vm.error = 'New password is required.';
                return false;
            }
            
            if (vm.passwordForm.new_password.length < 8) {
                vm.error = 'New password must be at least 8 characters long.';
                return false;
            }
            
            if (vm.passwordForm.new_password !== vm.passwordForm.confirm_password) {
                vm.error = 'New passwords do not match.';
                return false;
            }
            
            if (!validatePasswordStrength(vm.passwordForm.new_password)) {
                vm.error = 'Password must contain at least one uppercase letter, one lowercase letter, and one number.';
                return false;
            }
            
            return true;
        }
        
        function validatePasswordStrength(password) {
            var hasUpper = /[A-Z]/.test(password);
            var hasLower = /[a-z]/.test(password);
            var hasNumber = /\d/.test(password);
            return hasUpper && hasLower && hasNumber;
        }
    }
})();